import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { TildaIntegration } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { maskEmail } from '../common/redact';
import { isOriginAllowed, normalizeDomain } from './origin';
import { OtpService } from './otp.service';
import { MailService } from '../mail/mail.service';
import { StorageService } from '../storage/storage.service';
import { TildaProcessor } from './tilda.processor';
import type { PublicConfig } from './tilda-snippet';
import type { IntegrationDto, SubmitDto } from './tilda.dto';

/**
 * Версия текста согласия. Меняется вместе с текстом: по ней потом видно,
 * на что именно соглашался человек в конкретный день.
 */
export const CONSENT_VERSION = '2026-08-02';

/**
 * Подпись у галочки согласия.
 *
 * Конкретная: названа цель («изготовить и прислать документ»), а не
 * «согласие с условиями». Согласие по 152-ФЗ должно быть конкретным
 * и информированным, и «я со всем согласен» этому не отвечает.
 *
 * Полный текст — по ссылке рядом: уместить в подпись состав данных,
 * реквизиты оператора и срок хранения нельзя, а прочесть их человек
 * должен иметь возможность.
 */
export const CONSENT_LABEL =
  'Я даю согласие на обработку моих персональных данных — ' +
  'фамилии, имени и адреса почты — чтобы мне изготовили и прислали документ';

/**
 * Сколько живёт ссылка на скачивание. Документ уходит письмом, окно в браузере —
 * только удобство «здесь и сейчас»: вечная ссылка означала бы, что попавший
 * в чужую историю браузера адрес открывает чужой документ спустя месяцы.
 */
const DOWNLOAD_WINDOW_MS = 60 * 60 * 1000;

export interface SubmitContext {
  origin?: string;
  referer?: string;
  ip?: string;
  userAgent?: string;
}

export type SubmitResult =
  | { status: 'need_code'; requestId: string }
  | { status: 'processing'; requestId: string }
  | { status: 'already_issued'; requestId: string };

/**
 * Публичный приём заявок с форм на сайтах клиентов.
 *
 * Это самая уязвимая точка сервиса: сессии нет, токен интеграции лежит
 * в HTML страницы и виден всем. Поэтому защита многослойная, и ни один слой
 * не считается достаточным сам по себе: проверка источника, белый список
 * документов, ловушка для автоматов, подтверждение адреса кодом, суточный
 * лимит и ограничение частоты по адресу обращения.
 */
@Injectable()
export class TildaService {
  private readonly logger = new Logger(TildaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly processor: TildaProcessor,
  ) {}

  /**
   * Отказы наружу намеренно обезличены: подробности сообщают злоумышленнику,
   * какой именно барьер он задел. Причина пишется в журнал.
   */
  private reject(reason: string, publicMessage = 'Не удалось принять заявку'): never {
    this.logger.warn(`Заявка отклонена: ${reason}`);
    throw new BadRequestException(publicMessage);
  }

  async submit(dto: SubmitDto, ctx: SubmitContext): Promise<SubmitResult> {
    const integration = await this.prisma.tildaIntegration.findUnique({
      where: { token: dto.token },
    });
    if (!integration || !integration.active) {
      this.reject('интеграция не найдена или выключена');
    }

    // Ловушка: поле скрыто стилями, человек его не заполняет.
    // Отвечаем как при успехе, чтобы автомат не понял, что его распознали.
    if (dto.website) {
      this.logger.warn(`Заявка от автомата отсеяна ловушкой, интеграция ${integration.id}`);
      return { status: 'processing', requestId: crypto.randomUUID() };
    }

    if (!isOriginAllowed(ctx.origin, ctx.referer, integration.allowedDomains)) {
      this.reject(`источник «${ctx.origin ?? ctx.referer ?? 'не указан'}» не разрешён`);
    }

    if (!integration.documentIds.includes(dto.documentId)) {
      this.reject(`документ ${dto.documentId} не разрешён для интеграции ${integration.id}`);
    }

    const document = await this.prisma.document.findFirst({
      where: { id: dto.documentId, orgId: integration.orgId, deletedAt: null },
      select: { id: true },
    });
    if (!document) this.reject('документ не найден или удалён');

    await this.assertDailyLimit(integration);

    // Повторный запрос того же документа: отдаём выданное, а не плодим
    // дубликаты. Так же ведёт себя сервис, который мы заменяем.
    //
    // Ищем по двум приметам. Адрес учётной записи важнее: его человек
    // не набирал, он подставлен кабинетом, в который человек вошёл, —
    // и по нему выдача остаётся однократной, даже если адрес доставки
    // разрешено менять. Проверка только по адресу доставки обходится
    // за пять секунд: вписал другую почту и получил второй сертификат.
    if (integration.singleFilePerEmail) {
      const issued = await this.prisma.tildaRequest.findFirst({
        where: {
          documentId: dto.documentId,
          status: 'done',
          OR: [
            { email: dto.email },
            ...(dto.accountEmail ? [{ accountEmail: dto.accountEmail }] : []),
          ],
        },
        select: { id: true },
      });
      if (issued) return { status: 'already_issued', requestId: issued.id };
    }

    const needsCode = integration.authMode === 'email_code';

    const request = await this.prisma.tildaRequest.create({
      data: {
        integrationId: integration.id,
        orgId: integration.orgId,
        documentId: dto.documentId,
        email: dto.email,
        accountEmail: dto.accountEmail ?? null,
        fields: dto.fields,
        ip: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 500),
        status: needsCode ? 'pending_otp' : 'processing',
      },
    });

    await this.recordConsents(dto, request.id, integration.orgId, ctx);

    if (needsCode) {
      const code = await this.otp.issue(request.id);
      await this.mail.sendCode(integration.orgId, dto.email, code);
      return { status: 'need_code', requestId: request.id };
    }

    await this.processor.enqueue(request.id);
    return { status: 'processing', requestId: request.id };
  }

  /** Настройки, которые попадают в скрипт на странице клиента. */
  async publicConfig(token: string): Promise<PublicConfig> {
    const integration = await this.prisma.tildaIntegration.findUnique({ where: { token } });
    if (!integration || !integration.active) {
      throw new NotFoundException('Интеграция не найдена');
    }
    return {
      token: integration.token,
      authMode: integration.authMode,
      successMessage: integration.successMessage,
      showDownload: integration.showDownload,
      // Пустым этот текст оставлять нельзя. Раньше галочку рисовал сам
      // клиент в своей форме на Тильде и подписывал её как хотел; в нашем
      // окне подтверждения рисуем её мы — и галочка без текста означала бы
      // согласие неизвестно на что, то есть отсутствие согласия.
      consentText: CONSENT_LABEL,
      privacyUrl: `${publicUrl()}/privacy`,
      consentVersion: CONSENT_VERSION,
      prefillFromAccount: integration.prefillFromAccount,
      allowEdit: integration.allowEdit,
      showShare: integration.showShare,
      showVerifyLink: integration.showVerifyLink,
    };
  }

  async confirm(requestId: string, code: string): Promise<{ status: string; message?: string }> {
    const request = await this.prisma.tildaRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== 'pending_otp') {
      throw new NotFoundException('Заявка не найдена или уже обработана');
    }

    const result = await this.otp.verify(requestId, code);
    if (result === 'ok') {
      await this.prisma.tildaRequest.update({
        where: { id: requestId },
        data: { status: 'processing' },
      });
      await this.processor.enqueue(requestId);
      return { status: 'processing' };
    }

    if (result === 'blocked') {
      await this.prisma.tildaRequest.update({
        where: { id: requestId },
        data: { status: 'rejected', error: 'Превышено число попыток ввода кода' },
      });
      throw new BadRequestException('Слишком много неверных попыток. Заполните форму заново');
    }

    throw new BadRequestException(
      result === 'expired' ? 'Срок действия кода истёк' : 'Неверный код',
    );
  }

  async status(requestId: string) {
    const request = await this.prisma.tildaRequest.findUnique({
      where: { id: requestId },
      select: {
        status: true,
        error: true,
        fileId: true,
        doneAt: true,
        documentId: true,
        integration: {
          select: { successMessage: true, showDownload: true, showVerifyLink: true },
        },
      },
    });
    if (!request) throw new NotFoundException('Заявка не найдена');

    return {
      status: request.status,
      message: request.status === 'done' ? request.integration.successMessage : undefined,
      // Ссылка на скачивание выдаётся отдельным маршрутом, идентификатор
      // файла наружу не отдаём. Условие ровно то же, что и на самом маршруте,
      // включая окно по времени: иначе кнопка предлагала бы то, чего уже нет.
      canDownload: request.integration.showDownload && this.downloadable(request),
      verifyUrl: await this.verifyUrlFor(request),
      error: request.status === 'failed' ? 'Не удалось создать документ' : undefined,
    };
  }

  /**
   * Ссылка на страницу проверки подлинности — или ничего.
   *
   * Отдаём, только когда ей есть что показать: проверка включена
   * у документа, разрешена в настройках интеграции и у этого экземпляра
   * не отозвана. Иначе человек пошёл бы по ссылке и увидел «документ
   * не найден» про свой собственный, только что полученный.
   *
   * Отдельным запросом, а не соединением: у заявки в схеме нет связей
   * с файлом и документом, и заводить их ради одной ссылки в окне успеха
   * значило бы менять модель данных под нужды одного экрана. Запрос
   * идёт только для завершённых заявок с включённой настройкой.
   */
  private async verifyUrlFor(request: {
    status: string;
    fileId: string | null;
    documentId: string;
    integration: { showVerifyLink: boolean };
  }): Promise<string | undefined> {
    if (request.status !== 'done' || !request.integration.showVerifyLink || !request.fileId) {
      return undefined;
    }

    const [file, document] = await Promise.all([
      this.prisma.file.findUnique({
        where: { id: request.fileId },
        select: { publicId: true, verifyRevoked: true },
      }),
      this.prisma.document.findUnique({
        where: { id: request.documentId },
        select: { verifyEnabled: true },
      }),
    ]);

    if (!file || file.verifyRevoked || !document?.verifyEnabled) return undefined;
    return `${publicUrl()}/verify/${file.publicId}`;
  }

  private downloadable(request: {
    status: string;
    fileId: string | null;
    doneAt: Date | null;
  }): boolean {
    if (request.status !== 'done' || !request.fileId || !request.doneAt) return false;
    return Date.now() - request.doneAt.getTime() <= DOWNLOAD_WINDOW_MS;
  }

  // ─── Управление интеграциями из кабинета ─────────────────────────────────

  async listIntegrations(orgId: string) {
    return this.prisma.tildaIntegration.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { requests: true } } },
    });
  }

  async getIntegration(orgId: string, id: string) {
    const integration = await this.prisma.tildaIntegration.findFirst({ where: { id, orgId } });
    if (!integration) throw new NotFoundException('Интеграция не найдена');
    return integration;
  }

  async createIntegration(orgId: string, dto: IntegrationDto) {
    const data = await this.prepareIntegration(orgId, dto);
    return this.prisma.tildaIntegration.create({ data: { orgId, ...data } as never });
  }

  async updateIntegration(orgId: string, id: string, dto: Partial<IntegrationDto>) {
    await this.getIntegration(orgId, id);
    const data = await this.prepareIntegration(orgId, dto);
    return this.prisma.tildaIntegration.update({ where: { id }, data: data as never });
  }

  async deleteIntegration(orgId: string, id: string) {
    await this.getIntegration(orgId, id);
    await this.prisma.tildaIntegration.delete({ where: { id } });
    return { ok: true };
  }

  /** Заявки по интеграции — журнал выдачи для организатора. */
  async listRequests(orgId: string, integrationId?: string, documentId?: string) {
    return this.prisma.tildaRequest.findMany({
      where: { orgId, ...(integrationId ? { integrationId } : {}), ...(documentId ? { documentId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        email: true,
        fields: true,
        status: true,
        error: true,
        createdAt: true,
        doneAt: true,
        documentId: true,
      },
    });
  }

  /**
   * Приведение настроек к хранимому виду.
   *
   * Документы проверяются на принадлежность организации: иначе в белый список
   * интеграции можно было бы вписать чужой идентификатор и раздавать через
   * свою форму чужие грамоты.
   */
  private async prepareIntegration(orgId: string, dto: Partial<IntegrationDto>) {
    const data: Record<string, unknown> = { ...dto };

    if (dto.documentIds) {
      const owned = await this.prisma.document.findMany({
        where: { id: { in: dto.documentIds }, orgId, deletedAt: null },
        select: { id: true },
      });
      if (owned.length !== dto.documentIds.length) {
        throw new NotFoundException('Документ не найден');
      }
    }

    if (dto.allowedDomains) {
      const domains = dto.allowedDomains.map(normalizeDomain).filter(Boolean);
      if (domains.length === 0) {
        throw new BadRequestException('Укажите домен страницы, на которой стоит форма');
      }
      data.allowedDomains = Array.from(new Set(domains));
    }

    // Пустая строка в поле копии означает «копию не слать», а не адрес.
    if (dto.copyToEmail !== undefined) data.copyToEmail = dto.copyToEmail || null;

    return data;
  }

  /**
   * Отдача готового документа в окне браузера.
   *
   * Идентификатор заявки случаен и известен только заполнившему форму,
   * но этого мало: ссылка ограничена по времени, а файл отдаётся потоком
   * через приложение, чтобы наружу не утекал адрес в хранилище.
   */
  async download(requestId: string) {
    const request = await this.prisma.tildaRequest.findUnique({
      where: { id: requestId },
      include: { integration: { select: { showDownload: true } } },
    });
    if (
      !request ||
      !request.integration.showDownload ||
      request.status !== 'done' ||
      !request.fileId
    ) {
      throw new NotFoundException('Документ недоступен');
    }
    if (!this.downloadable(request)) {
      throw new NotFoundException('Срок действия ссылки истёк — документ отправлен на вашу почту');
    }

    const file = await this.prisma.file.findFirst({
      where: { id: request.fileId, deletedAt: null },
      select: { s3Key: true, mime: true, originalName: true },
    });
    if (!file) throw new NotFoundException('Документ недоступен');

    return {
      stream: await this.storage.getStream(file.s3Key),
      filename: file.originalName || 'Документ.pdf',
      mime: file.mime,
    };
  }

  /**
   * Суточный лимит на интеграцию. Защищает клиента от того, что кто-то
   * за ночь выкачает тысячу документов и исчерпает его почтовый пакет.
   */
  private async assertDailyLimit(integration: TildaIntegration): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await this.prisma.tildaRequest.count({
      where: { integrationId: integration.id, createdAt: { gte: since } },
    });
    if (count >= integration.dailyLimit) {
      this.reject(
        `суточный лимит интеграции ${integration.id} исчерпан (${count})`,
        'Сегодня выдача документов по этой форме уже недоступна. Попробуйте завтра',
      );
    }
  }

  /**
   * Запись согласий. Без неё доказать наличие согласия при споре невозможно,
   * а договор-поручение обязывает нас предоставлять эти сведения заказчику.
   */
  private async recordConsents(
    dto: SubmitDto,
    requestId: string,
    orgId: string,
    ctx: SubmitContext,
  ): Promise<void> {
    const base = {
      orgId,
      requestId,
      documentId: dto.documentId,
      subjectEmail: dto.email,
      textVersion: dto.consentVersion,
      formId: normalizeDomain(ctx.origin ?? ctx.referer ?? ''),
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, 500),
    };

    await this.prisma.consent.createMany({
      data: [
        { ...base, purpose: 'certificate' as const, granted: true },
        // Отказ от рассылки фиксируем тоже: он же доказывает, что галочка
        // не была предзаполнена и человек её осознанно не поставил.
        { ...base, purpose: 'marketing' as const, granted: dto.consentMarketing },
      ],
    });

    this.logger.log(`Согласия записаны для ${maskEmail(dto.email)}, заявка ${requestId}`);
  }
}

function publicUrl(): string {
  return (process.env.PUBLIC_URL ?? 'https://vruchay.ru').replace(/\/+$/, '');
}
