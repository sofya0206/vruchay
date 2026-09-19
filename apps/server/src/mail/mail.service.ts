import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailKind } from '@prisma/client';
import { baseUrl, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SmtpProvider } from './smtp.provider';
import {
  escapeHtml,
  isValidEmail,
  mailButton,
  renderHtmlTemplate,
  renderSubject,
  sanitizeEmailHtml,
} from './mail-template';
import type { MailAttachment, MailProvider, NormalizedEvent } from './mail-provider.interface';
import { advanceStatus, type EmailStatus } from './email-status';
import { sharedDomainRefusal } from './shared-domain-limit';
import { platformSender, type ResolvedSender } from './platform-sender';
import { withOpenPixel } from './open-tracking';
import { renderLetterBody, unsubscribeUrl } from '../mailing/letter-kind';
import { signRecipientToken } from '../recipient/recipient-token';
import { deliveryProblem } from '../mailing/bounce-reason';
import { redact } from '../common/redact';

/**
 * Запасной текст письма — когда документ выдан по заявке с формы,
 * а шаблон письма организация ещё не настроила. Без переменных:
 * подставлять нечего, а пустые места в письме хуже нейтрального текста.
 */
const DEFAULT_SUBJECT = 'Ваш документ';
const DEFAULT_BODY_HTML =
  '<p style="font-size:15px">Здравствуйте!</p>' +
  '<p style="font-size:15px">Ваш документ во вложении к этому письму.</p>';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly smtp: SmtpProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Публичный адрес сервиса без косой черты — из проверенной схемы настроек. */
  private get publicUrl(): string {
    return baseUrl(this.config.get('PUBLIC_URL', { infer: true }));
  }

  /** Пока провайдер один; когда появится DashaMail — выбор по домену отправителя. */
  private providerFor(_provider: string): MailProvider {
    return this.smtp;
  }

  // ─── Домены ──────────────────────────────────────────────────────────────

  async addDomain(orgId: string, domain: string) {
    const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized)) {
      throw new BadRequestException('Некорректное имя домена');
    }

    // Домен, уже подтверждённый другой организацией, заявить нельзя:
    // иначе можно было бы слать письма от имени чужой организации.
    const claimed = await this.prisma.mailDomain.findFirst({
      where: { domain: normalized, status: 'verified', orgId: { not: orgId } },
      select: { id: true },
    });
    if (claimed) {
      throw new BadRequestException(
        'Этот домен уже подтверждён другой организацией. Если он принадлежит вам, напишите в поддержку',
      );
    }

    const provider = this.providerFor('smtp');
    const verificationToken = randomUUID();
    const records = await provider.getDomainSetup(normalized, verificationToken);

    return this.prisma.mailDomain.create({
      data: {
        orgId,
        domain: normalized,
        provider: provider.name,
        verificationToken,
        dnsRecords: records as unknown as object,
      },
    });
  }

  async listDomains(orgId: string) {
    return this.prisma.mailDomain.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
      include: { senders: true },
    });
  }

  /** Проверка DNS по кнопке. Записи обновляются до 48 часов — это нормально. */
  async checkDomain(orgId: string, domainId: string) {
    const domain = await this.prisma.mailDomain.findFirst({ where: { id: domainId, orgId } });
    if (!domain) throw new NotFoundException('Домен не найден');

    const provider = this.providerFor(domain.provider);
    const status = await provider.checkDomain(
      domain.domain,
      domain.dnsRecords as never,
    );

    return this.prisma.mailDomain.update({
      where: { id: domainId },
      data: {
        status,
        lastCheckedAt: new Date(),
        verifiedAt: status === 'verified' ? (domain.verifiedAt ?? new Date()) : null,
      },
    });
  }

  async deleteDomain(orgId: string, domainId: string) {
    const domain = await this.prisma.mailDomain.findFirst({ where: { id: domainId, orgId } });
    if (!domain) throw new NotFoundException('Домен не найден');
    await this.prisma.mailDomain.delete({ where: { id: domainId } });
    return { ok: true };
  }

  // ─── Отправители ─────────────────────────────────────────────────────────

  async addSender(orgId: string, domainId: string, email: string, displayName: string) {
    const domain = await this.prisma.mailDomain.findFirst({ where: { id: domainId, orgId } });
    if (!domain) throw new NotFoundException('Домен не найден');

    // Пока владение доменом не доказано, отправитель на нём создаваться не должен:
    // это и есть защита от рассылки от имени чужой организации.
    if (domain.status !== 'verified') {
      throw new BadRequestException(
        'Домен ещё не подтверждён. Пропишите DNS-записи и нажмите «Проверить»',
      );
    }

    const normalized = email.trim().toLowerCase();
    if (!isValidEmail(normalized)) throw new BadRequestException('Некорректный адрес');

    // Адрес обязан принадлежать подключённому домену: иначе письма от чужого
    // имени уйдут с нашей инфраструктуры и утянут её репутацию.
    if (!normalized.endsWith(`@${domain.domain}`)) {
      throw new BadRequestException(`Адрес должен быть на домене ${domain.domain}`);
    }

    return this.prisma.sender.create({
      data: { orgId, domainId, email: normalized, displayName: displayName.trim() },
    });
  }

  /**
   * Убрать отправителя. Ищем по паре id + orgId: по чужому
   * идентификатору получается «не найден», а не «нельзя» — иначе
   * ответ подтверждал бы, что такой отправитель у кого-то есть.
   *
   * Письма, уже отправленные с этого адреса, остаются в истории:
   * Email хранит адрес строкой, а не ссылкой на отправителя.
   */
  async deleteSender(orgId: string, id: string) {
    const { count } = await this.prisma.sender.deleteMany({ where: { id, orgId } });
    if (count === 0) throw new NotFoundException('Отправитель не найден');
    return { ok: true as const };
  }

  /**
   * Правка отправителя: обратный адрес и подпись.
   *
   * Сам адрес и домен не меняются — они подтверждены DNS, и подмена
   * означала бы отправку от чужого имени. Меняется только то, что
   * организация вправе написать о себе сама.
   */
  async updateSender(
    orgId: string,
    senderId: string,
    data: { displayName?: string; replyTo?: string; signature?: string },
  ) {
    const sender = await this.prisma.sender.findFirst({ where: { id: senderId, orgId } });
    if (!sender) throw new NotFoundException('Отправитель не найден');

    const replyTo = data.replyTo?.trim().toLowerCase() ?? sender.replyTo;
    if (replyTo && !isValidEmail(replyTo)) {
      throw new BadRequestException('Некорректный адрес для ответов');
    }

    return this.prisma.sender.update({
      where: { id: senderId },
      data: {
        ...(data.displayName === undefined ? {} : { displayName: data.displayName.trim() }),
        ...(data.replyTo === undefined ? {} : { replyTo }),
        // Подпись — пользовательский HTML, чистим тем же способом, что тело
        // письма: иначе туда попадут скрипты и ссылки javascript:.
        ...(data.signature === undefined ? {} : { signature: sanitizeEmailHtml(data.signature) }),
      },
    });
  }

  /**
   * Тестовое письмо самому себе.
   *
   * Уходит только на адрес того, кто нажал кнопку, и никуда больше:
   * иначе кнопка «проверить» стала бы способом разослать что угодно
   * кому угодно с подтверждённого домена.
   */
  async sendTest(orgId: string, senderId: string, toEmail: string) {
    const sender = await this.prisma.sender.findFirst({
      where: { id: senderId, orgId },
      include: { domain: { select: { status: true, domain: true } } },
    });
    if (!sender) throw new NotFoundException('Отправитель не найден');
    if (sender.domain.status !== 'verified') {
      throw new BadRequestException(`Домен ${sender.domain.domain} не подтверждён — отправка невозможна`);
    }
    if (!isValidEmail(toEmail)) throw new BadRequestException('Некорректный адрес');

    const body =
      '<p style="font-size:15px">Это проверочное письмо из кабинета «Вручай».</p>' +
      '<p style="font-size:15px">Если оно дошло и в поле «от кого» стоит то, что вы ожидали, ' +
      'отправка настроена верно. Ответьте на него, чтобы проверить адрес для ответов.</p>';

    const { providerMessageId } = await this.providerFor('smtp').send({
      from: { email: sender.email, name: sender.displayName },
      replyTo: sender.replyTo || undefined,
      to: toEmail,
      subject: 'Проверка отправки — Вручай',
      html: renderLetterBody({ kind: 'transactional', bodyHtml: body, signature: sender.signature }),
    });
    return { ok: true as const, providerMessageId };
  }

  // ─── Шаблоны писем ───────────────────────────────────────────────────────

  async saveTemplate(
    orgId: string,
    documentId: string,
    data: { senderId?: string; subject: string; bodyHtml: string; attachGeneratedFile: boolean },
  ) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('Документ не найден');

    if (data.senderId) {
      const sender = await this.prisma.sender.findFirst({
        where: { id: data.senderId, orgId },
      });
      if (!sender) throw new NotFoundException('Отправитель не найден');
    }

    // Чистим при сохранении, а не при отправке: пользователь сразу увидит,
    // что именно сохранилось, и не обнаружит пропажу разметки в момент рассылки.
    const clean = { ...data, bodyHtml: sanitizeEmailHtml(data.bodyHtml) };

    const existing = await this.prisma.emailTemplate.findFirst({
      where: { orgId, documentId, kind: 'transactional' },
    });
    if (existing) {
      return this.prisma.emailTemplate.update({ where: { id: existing.id }, data: clean });
    }
    return this.prisma.emailTemplate.create({
      data: { orgId, documentId, kind: 'transactional', ...clean },
    });
  }

  /**
   * Письмо о выдаче документа.
   *
   * Фильтр по потоку обязателен, а не для порядка: у документа может быть
   * заведено и рекламное письмо, и без фильтра выдача документа однажды
   * ушла бы рекламным текстом — то есть рекламой без согласия, со штрафом
   * по ст. 14.3 КоАП за каждое письмо. Все, кто отправляет транзакционные
   * письма — выдача по заявке с формы, рассылка, — ходят через этот метод.
   */
  async getTemplate(orgId: string, documentId: string) {
    return this.prisma.emailTemplate.findFirst({
      where: { orgId, documentId, kind: 'transactional' },
      include: { sender: true },
    });
  }

  /**
   * Почему организация не может отправлять письма прямо сейчас. null — может.
   *
   * Проверяется перед каждой рассылкой, а не только при создании
   * отправителя: домен мог быть подтверждён раньше, а потом записи
   * из DNS убрали, и письма ушли бы в спам от имени организации.
   */
  async sendingRefusal(orgId: string, senderId: string | null): Promise<string | null> {
    if (senderId) {
      const sender = await this.prisma.sender.findFirst({
        where: { id: senderId, orgId },
        select: { domain: { select: { status: true, domain: true } } },
      });
      if (!sender) return 'Отправитель не найден';
      if (sender.domain.status !== 'verified') {
        return `Домен ${sender.domain.domain} не подтверждён — отправка невозможна`;
      }
      return null;
    }

    // Своего отправителя нет — письма уйдут с нашего домена. Отказываем,
    // только если и его нет: тогда слать действительно нечем.
    return (await this.resolveSender(orgId))
      ? null
      : 'Отправка писем не настроена — обратитесь в поддержку';
  }

  // ─── Постановка писем в очередь ──────────────────────────────────────────

  /**
   * Ставит письма отмеченным получателям, у которых уже есть готовый файл.
   * Возвращает разбор: сколько поставлено и почему остальные пропущены —
   * «отправлено 47 из 50» без объяснения оставшихся трёх бесполезно.
   */
  async queueForDocument(orgId: string, documentId: string) {
    const template = await this.getTemplate(orgId, documentId);
    if (!template) throw new BadRequestException('Сначала сохраните письмо');

    const refusal = await this.sendingRefusal(orgId, template.senderId);
    if (refusal) throw new BadRequestException(refusal);

    const rows = await this.prisma.recipientRow.findMany({
      where: { documentId, checked: true, document: { orgId, deletedAt: null } },
      include: { lastFile: true },
      orderBy: { position: 'asc' },
    });

    const skipped: { name: string; reason: string }[] = [];
    const toQueue: { rowId: string; email: string; data: Record<string, string> }[] = [];

    for (const row of rows) {
      const data = row.data as Record<string, string>;
      const name = data.name || '(без имени)';
      const email = (data.email ?? '').trim();

      if (!isValidEmail(email)) {
        skipped.push({ name, reason: email ? `некорректный адрес «${email}»` : 'нет адреса' });
        continue;
      }
      if (template.attachGeneratedFile && !row.lastFile) {
        skipped.push({ name, reason: 'документ ещё не создан' });
        continue;
      }
      toQueue.push({ rowId: row.id, email, data });
    }

    // Объём с общего домена ограничен: пока у организации нет своего
    // домена, репутация `noreply@vruchay.ru` общая на всех, и один
    // недобросовестный заказчик портит доставляемость остальным.
    // Со своего домена ограничения нет — там репутация его собственная.
    if (!template.sender) {
      const volume = await this.volumeRefusal(orgId, toQueue.length);
      if (volume) throw new BadRequestException(volume);
    }

    const created = await this.prisma.$transaction(
      toQueue.map((item) =>
        this.prisma.email.create({
          data: {
            orgId,
            documentId,
            rowId: item.rowId,
            templateId: template.id,
            fileId: template.attachGeneratedFile
              ? rows.find((r) => r.id === item.rowId)?.lastFileId
              : null,
            kind: 'transactional',
            toEmail: item.email,
            subject: renderSubject(template.subject, item.data),
            provider: this.providerFor('smtp').name,
          },
        }),
      ),
    );

    return { queued: created.length, skipped, emailIds: created.map((e) => e.id) };
  }

  /**
   * Письмо по одной заявке с публичной формы.
   *
   * Шаблон документа используется, если он настроен: организация уже описала
   * там и текст, и отправителя. Если шаблона нет — заявка всё равно должна
   * дойти до человека, поэтому отправляем служебным текстом.
   * Запись в журнале создаётся в обоих случаях: выдача документа постороннему
   * человеку обязана быть видна владельцу.
   */
  async queueSingle(
    orgId: string,
    documentId: string,
    toEmail: string,
    data: Record<string, string>,
    fileId: string,
  ): Promise<string> {
    if (!isValidEmail(toEmail)) throw new BadRequestException('Некорректный адрес');

    const template = await this.checkedTemplate(orgId, documentId);

    const email = await this.prisma.email.create({
      data: {
        orgId,
        documentId,
        templateId: template?.id,
        fileId,
        kind: 'transactional',
        toEmail: toEmail.trim().toLowerCase(),
        subject: template ? renderSubject(template.subject, data) : DEFAULT_SUBJECT,
        provider: this.providerFor('smtp').name,
      },
    });
    return email.id;
  }

  /**
   * Служебное письмо о самом документе — уведомление о скором истечении
   * срока. Текст пишет сервис, а не организация, поэтому он идёт в письме
   * готовым, а файл не прикладывается: он у человека уже есть.
   *
   * Поток транзакционный: сообщение о сроке собственного документа —
   * переписка по существу, а не реклама, согласия по ст. 18 ФЗ «О рекламе»
   * не требует. Отправитель — тот же, что у писем о выдаче по этому
   * материалу: участник должен узнать организацию, а не сервис.
   */
  async queueNotice(
    orgId: string,
    notice: {
      documentId: string;
      fileId: string;
      rowId: string | null;
      toEmail: string;
      subject: string;
      bodyHtml: string;
    },
  ): Promise<string> {
    if (!isValidEmail(notice.toEmail)) throw new BadRequestException('Некорректный адрес');

    const template = await this.checkedTemplate(orgId, notice.documentId);

    const email = await this.prisma.email.create({
      data: {
        orgId,
        documentId: notice.documentId,
        rowId: notice.rowId,
        templateId: template?.id,
        fileId: notice.fileId,
        kind: 'transactional',
        toEmail: notice.toEmail.trim().toLowerCase(),
        subject: notice.subject,
        bodyHtml: notice.bodyHtml,
        attachFile: false,
        provider: this.providerFor('smtp').name,
      },
    });
    return email.id;
  }

  /**
   * Шаблон материала с проверкой, что от его имени можно слать.
   *
   * Домен мог перестать быть подтверждённым уже после настройки шаблона.
   * Проверяем только свой домен организации: у отправителя на нашем домене
   * domainId нет, и проверять там нечего — он подтверждён по построению.
   */
  private async checkedTemplate(orgId: string, documentId: string) {
    const template = await this.getTemplate(orgId, documentId);
    const sender = template?.sender
      ? { email: template.sender.email, displayName: template.sender.displayName, domainId: template.sender.domainId }
      : await this.resolveSender(orgId);
    if (!sender) {
      throw new BadRequestException('Отправка писем не настроена — обратитесь в поддержку');
    }

    if (sender.domainId) {
      const domain = await this.prisma.mailDomain.findFirst({
        where: { id: sender.domainId, orgId },
        select: { status: true },
      });
      if (domain?.status !== 'verified') {
        throw new BadRequestException('Домен отправителя не подтверждён — отправка невозможна');
      }
    }

    return template;
  }

  /**
   * Отправка одного письма. Вызывается воркером.
   *
   * `lastAttempt` — повторять письмо очереди больше нечем. Воркер считает
   * это по своим попыткам и передаёт сюда: сервис о настройках очереди
   * не знает, а без признака он не может отличить «сейчас не получилось,
   * повторим» от «не получилось окончательно».
   *
   * По умолчанию попытка считается последней: прямой вызов мимо очереди
   * повторять некому, и письмо обязано получить окончательное состояние,
   * а не остаться навсегда «в очереди».
   */
  async sendOne(emailId: string, lastAttempt = true): Promise<void> {
    const email = await this.prisma.email.findUnique({
      where: { id: emailId },
      include: { template: { include: { sender: true } }, file: true },
    });
    if (!email) return;

    // Письма по заявкам с форм шаблона могут не иметь — отправитель тогда
    // берётся по умолчанию, а тело письма служебное.
    const sender = email.template?.sender
      ? {
          email: email.template.sender.email,
          displayName: email.template.sender.displayName,
          // Обратный адрес и подпись задаются на отправителе: письма часто
          // уходят с noreply, а отвечать участник должен живому человеку.
          replyTo: email.template.sender.replyTo || undefined,
          signature: email.template.sender.signature,
        }
      : await this.resolveSender(email.orgId);
    if (!sender) {
      this.logger.error(`Письмо ${emailId}: отправка не настроена — нет PLATFORM_MAIL_FROM`);
      await this.prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'failed',
          error: 'Отправка писем не настроена',
          statusUpdatedAt: new Date(),
        },
      });
      return;
    }

    // Реклама без указания рекламодателя незаконна сама по себе, поэтому
    // такое письмо не уходит вовсе. Проверка стоит и при сохранении шаблона,
    // и здесь: рекламодателя могли стереть уже после постановки в очередь.
    if (email.kind === 'marketing' && !email.template?.advertiserName?.trim()) {
      this.logger.error(`Письмо ${emailId}: рекламное письмо без рекламодателя не отправлено`);
      await this.prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'failed',
          error: 'Рекламное письмо без рекламодателя не отправляется',
          statusUpdatedAt: new Date(),
        },
      });
      return;
    }

    const row = email.rowId
      ? await this.prisma.recipientRow.findUnique({ where: { id: email.rowId } })
      : null;
    // Письму без строки таблицы — рассылке списком адресов — известен
    // только сам адрес. Его и отдаём: %email в тексте не должен пропадать.
    const data = (row?.data as Record<string, string>) ?? { email: email.toEmail };

    try {
      // Уведомление о сроке уходит без файла: документ у человека уже есть.
      const attachments =
        email.file && email.attachFile
          ? [
            {
              filename: email.file.originalName || 'Документ.pdf',
              content: await this.storage.getStream(email.file.s3Key),
              contentType: email.file.mime,
            },
          ]
        : undefined;

      const { providerMessageId } = await this.providerFor(email.provider).send({
        from: { email: sender.email, name: sender.displayName },
        replyTo: sender.replyTo,
        to: email.toEmail,
        subject: email.subject,
        html: this.trackOpens(this.letterBody(email, data, sender.signature, email.file ? this.documentLink(email.file.id) : ''), email.id),
        attachments,
        reference: email.id,
        // Отписка ещё и заголовком: почтовые службы показывают по нему
        // свою кнопку «Отписаться», а письма без него считают менее
        // добросовестными и чаще уводят в спам. Ссылка та же, что в подвале.
        listUnsubscribeUrl: this.unsubscribeLink(email),
      });

      await this.prisma.$transaction([
        this.prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'sent',
            providerMessageId,
            sentAt: new Date(),
            statusUpdatedAt: new Date(),
            error: null,
          },
        }),
        this.prisma.emailEvent.create({
          data: { emailId, type: 'sent', source: 'provider' },
        }),
      ]);
    } catch (err) {
      // Ответ почтового шлюза почти всегда содержит адрес получателя
      // («550 <ivanov@example.ru>: Recipient address rejected»), поэтому
      // маскируем и перед записью в журнал, и перед сохранением в базу:
      // причина отказа остаётся понятной, персональные данные не размножаются.
      const message = redact(err instanceof Error ? err.message : String(err));

      // Отличаем «сейчас не вышло» от «не выйдет никогда» тем же разбором
      // причин, что показывает их человеку в журнале: второй список правил
      // разошёлся бы с первым на первой же правке.
      const problem = deliveryProblem('failed', message);
      const retryable = problem?.retryable ?? true;

      if (retryable && !lastAttempt) {
        // Ошибку не гасим, а выпускаем наружу: повтор запускает очередь,
        // и минута недоступности шлюза больше не хоронит всю рассылку.
        // Состояние остаётся «в очереди» — письмо ещё не проиграно.
        this.logger.warn(`Письмо ${emailId}: ${message}. Попробуем ещё раз`);
        await this.prisma.email.update({
          where: { id: emailId },
          data: { error: message.slice(0, 500) },
        });
        // Наружу отдаём уже обезличенный текст: очередь сохраняет причину
        // отказа у себя, и адрес получателя не должен уезжать ещё и туда.
        throw new Error(message, { cause: err });
      }

      this.logger.warn(`Письмо ${emailId} не отправлено: ${message}`);
      await this.prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'failed',
          error: message.slice(0, 500),
          statusUpdatedAt: new Date(),
        },
      });

      // Безнадёжный адрес повторять нечего: письмо помечено, работа
      // задания на этом закончена — падать ему незачем.
      if (retryable) throw new Error(message, { cause: err });
    }
  }

  /**
   * Ссылка отписки для заголовка письма. Пусто — заголовку взяться неоткуда.
   *
   * Только у рекламных писем: у письма о выдаче документа отписки нет
   * и быть не может — это переписка по существу, а не рассылка.
   */
  private unsubscribeLink(email: { kind: EmailKind; id: string }): string | undefined {
    const publicUrl = this.publicUrl;
    if (email.kind !== 'marketing' || !publicUrl) return undefined;
    return unsubscribeUrl(publicUrl, email.id);
  }

  /**
   * Тело письма по его потоку.
   *
   * Рекламный низ — пометка «Реклама», рекламодатель и отписка — добавляет
   * renderLetterBody, и добавляет только рекламной ветке. Транзакционному
   * письму его взять неоткуда: у соответствующего типа попросту нет полей
   * рекламодателя и ссылки отписки (см. mailing/letter-kind.ts).
   */
  /**
   * Кнопка «Открыть документ» под текстом письма.
   *
   * Вложение остаётся: на телефоне PDF из письма открывается в просмотрщике,
   * а сохранить, переслать и проверить проще со страницы сервиса. Ссылка
   * подписана и действует месяц; в базе ничего не хранит.
   */
  private documentLink(fileId: string): string {
    const url = `${this.publicUrl}/d/${signRecipientToken(this.config.get('SESSION_SECRET', { infer: true }), fileId)}`;
    return (
      mailButton(url, 'Открыть документ') +
      '<p style="margin:-12px 0 24px;font-size:13px;color:#36394a">Открыть, сохранить на телефон, проверить подлинность.</p>'
    );
  }

  private letterBody(
    email: {
      kind: EmailKind;
      id: string;
      bodyHtml: string | null;
      template: { bodyHtml: string; advertiserName: string | null } | null;
    },
    data: Record<string, string>,
    signature = '',
    /** Что добавить после текста оператора — кнопка на страницу документа. */
    extra = '',
  ): string {
    // Готовый текст сервиса (уведомление о сроке) — как есть: он собран
    // нами с экранированием, переменных в нём нет.
    const bodyHtml =
      (email.bodyHtml ??
        (email.template ? renderHtmlTemplate(email.template.bodyHtml, data) : DEFAULT_BODY_HTML)) + extra;

    if (email.kind !== 'marketing') {
      return renderLetterBody({ kind: 'transactional', bodyHtml, signature });
    }

    return renderLetterBody({
      kind: 'marketing',
      bodyHtml,
      advertiserName: email.template?.advertiserName ?? '',
      unsubscribeUrl: unsubscribeUrl(this.publicUrl, email.id),
    });
  }

  /**
   * Подставляет в письмо отметку о прочтении.
   *
   * Без внешнего адреса сервиса ссылку собрать не из чего — тогда письмо
   * уходит без картинки. Это правильное поведение: письмо важнее статистики,
   * и ронять рассылку из-за незаполненной переменной окружения нельзя.
   */
  private trackOpens(html: string, emailId: string): string {
    const publicUrl = this.publicUrl;
    return publicUrl ? withOpenPixel(html, publicUrl, emailId) : html;
  }

  /**
   * Письмо открыли.
   *
   * Назад по цепочке состояний не идём: у отменённого или не доставленного
   * письма отметка о прочтении означала бы, что где-то ошибка, а не что
   * участник его прочёл. Поэтому обновляем только то, что уже отправлено
   * или доставлено.
   *
   * Событие пишем каждый раз, а состояние — только при первом открытии:
   * в реестре нужно «прочитано», а сколько раз открывали, видно в журнале
   * событий, если понадобится разбираться.
   */
  async markOpened(emailId: string): Promise<void> {
    try {
      const updated = await this.prisma.email.updateMany({
        where: { id: emailId, status: { in: ['sent', 'delivered'] } },
        data: { status: 'opened', statusUpdatedAt: new Date() },
      });
      if (updated.count === 0) return;

      await this.prisma.emailEvent.create({
        data: { emailId, type: 'opened', source: 'pixel' },
      });
    } catch (err) {
      // Несуществующий идентификатор — обычное дело: письма удаляются
      // по срокам хранения, а картинка в старом письме остаётся навсегда.
      this.logger.debug(`Отметка о прочтении ${emailId}: ${(err as Error).message}`);
    }
  }

  /**
   * События от почтового провайдера: доставлено, не доставлено, открыто.
   *
   * До этого «доставлено» было недостижимо: SMTP сообщает только о том,
   * что письмо принято шлюзом, а дошло ли оно до ящика — знает провайдер.
   * Из-за этого недоставленное письмо выглядело как отправленное, и на
   * жалобу «мне ничего не пришло» ответить было нечем.
   *
   * Порядок состояний соблюдаем: событие никогда не отматывает письмо
   * назад. Уведомления приходят не по порядку — «доставлено» вполне может
   * прийти после «открыто», — и наивная запись затирала бы прочтение
   * доставкой.
   */
  async applyProviderEvents(events: NormalizedEvent[]): Promise<number> {
    let applied = 0;

    for (const event of events) {
      const email = await this.findEmailForEvent(event);
      if (!email) continue;

      try {
        await this.prisma.emailEvent.create({
          data: { emailId: email.id, type: event.type, source: 'webhook' },
        });
      } catch (err) {
        this.logger.debug(`Событие ${event.type} для ${email.id}: ${(err as Error).message}`);
      }

      const next = advanceStatus(email.status as EmailStatus, event.type);
      if (next) {
        await this.prisma.email.update({
          where: { id: email.id },
          data: { status: next, statusUpdatedAt: event.occurredAt },
        });
      }
      applied++;
    }

    return applied;
  }

  /**
   * Сколько писем с общего домена организация уже отправила за сутки.
   *
   * Считаем по записям писем, а не отдельным счётчиком: счётчик пришлось
   * бы держать в согласии с реальностью при каждой ошибке и отмене,
   * а записи и есть то, что ушло. Тот же приём, что и в бесплатной пробе.
   *
   * Письма со своего домена в счёт не идут: у них своя репутация.
   */
  async volumeRefusal(orgId: string, adding: number): Promise<string | null> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const sentToday = await this.prisma.email.count({
      where: {
        orgId,
        queuedAt: { gte: since },
        // Письма с чужого, подтверждённого домена сюда не попадают:
        // у них в шаблоне указан отправитель организации.
        template: { senderId: null },
      },
    });

    return sharedDomainRefusal(
      { sentToday, adding },
      {
        perDay: this.config.get('SHARED_DOMAIN_DAILY_LIMIT', { infer: true }),
        perBatch: this.config.get('SHARED_DOMAIN_BATCH_LIMIT', { infer: true }),
      },
    );
  }

  /**
   * Ищет письмо, о котором пришло уведомление.
   *
   * Три способа по убыванию надёжности. Своя ссылка возвращается не
   * всегда: мы кладём её в заголовок отправляемого письма, а вернёт ли
   * провайдер чужой заголовок — его дело. Идентификатор провайдера мы
   * сохранили при отправке сами, поэтому он надёжен. Адрес получателя —
   * последнее средство: по нему берём самое свежее письмо, потому что
   * одному и тому же человеку мы могли слать не раз.
   *
   * Из тела уведомления при этом не берётся ничего, кроме примет для
   * поиска: организацию, документ и всё остальное мы знаем по своей записи.
   */
  private async findEmailForEvent(event: NormalizedEvent) {
    const select = { id: true, status: true } as const;

    if (event.reference) {
      const byRef = await this.prisma.email.findUnique({
        where: { id: event.reference },
        select,
      });
      if (byRef) return byRef;
    }

    if (event.providerMessageId) {
      const byProvider = await this.prisma.email.findFirst({
        where: { providerMessageId: event.providerMessageId },
        orderBy: { queuedAt: 'desc' },
        select,
      });
      if (byProvider) return byProvider;
    }

    if (event.email) {
      return this.prisma.email.findFirst({
        where: { toEmail: event.email },
        orderBy: { queuedAt: 'desc' },
        select,
      });
    }

    return null;
  }

  /**
   * Отправитель организации с подтверждённым доменом, если он настроен.
   *
   * Возвращает запись из базы либо null. Запасной вариант на нашем домене
   * подставляет resolveSender — здесь его нет намеренно: местам, которые
   * проверяют статус домена, нужен именно доменный отправитель.
   */
  private async ownSender(orgId: string) {
    return this.prisma.sender.findFirst({
      where: { orgId, domain: { status: 'verified' } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Кто стоит в письме отправителем — с запасным вариантом на нашем домене.
   *
   * Подключение своего домена это полчаса возни с DNS и ожидание проверки.
   * Требовать это до первой выдачи значит терять тех, кто хотел просто
   * попробовать. Поэтому по умолчанию письма уходят с vruchay.ru, а свой
   * домен подключается позже и только по желанию.
   *
   * Устроено так, чтобы получатель не запутался:
   *
   *  — в поле отправителя стоит название организации, а адрес наш. Подпись
   *    DKIM и запись SPF относятся к vruchay.ru, поэтому письмо проходит
   *    проверки. Ставить в адрес чужой домен, которым мы не владеем, нельзя:
   *    такое письмо попадёт в спам или будет отклонено;
   *  — ответ уходит организации, а не нам: без этого участник, нажавший
   *    «Ответить», писал бы в пустоту.
   */
  private async resolveSender(orgId: string): Promise<ResolvedSender | null> {
    const own = await this.ownSender(orgId);
    if (own) {
      return { email: own.email, displayName: own.displayName, domainId: own.domainId };
    }

    const platform = platformSender(
      this.config.get('PLATFORM_MAIL_FROM', { infer: true }),
      this.config.get('SERVICE_MAIL_FROM', { infer: true }),
    );
    if (!platform) return null;

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        // Владельцев может быть несколько; берём одного и всегда того же,
        // чтобы обратный адрес не менялся от письма к письму.
        members: {
          where: { role: 'owner' },
          orderBy: { userId: 'asc' },
          take: 1,
          select: { user: { select: { email: true } } },
        },
      },
    });

    return {
      email: platform.email,
      // Название организации в отправителе, а не «Вручай»: участник должен
      // видеть, кто его наградил, а не через какой сервис это сделано.
      displayName: org?.name?.trim() || platform.name,
      replyTo: org?.members[0]?.user.email,
    };
  }

  /**
   * Служебное письмо с кодом подтверждения.
   *
   * Идёт мимо шаблонов и журнала писем: это не рассылка документа, а разовая
   * проверка адреса. В журнал такие письма не пишем — иначе он забьётся
   * технической перепиской и в нём не найти реальную выдачу документов.
   */
  async sendCode(orgId: string, to: string, code: string): Promise<void> {
    const sender = await this.resolveSender(orgId);
    if (!sender) {
      throw new BadRequestException('Отправка писем не настроена — код выслать некуда');
    }

    await this.providerFor('smtp').send({
      from: { email: sender.email, name: sender.displayName },
      to,
      subject: `${code} — код для получения документа`,
      // Код в теме письма: человек видит его в списке писем, не открывая.
      html:
        `<p style="font-size:15px">Ваш код подтверждения:</p>` +
        `<p style="font-size:28px;letter-spacing:.2em;font-weight:600">${escapeHtml(code)}</p>` +
        `<p style="font-size:13px;color:#36394a">Код действует 10 минут. ` +
        `Если вы не запрашивали документ, просто проигнорируйте это письмо.</p>`,
    });
  }

  /**
   * Письмо самому себе — посмотреть, что получится.
   *
   * Мимо очереди и мимо журнала доставки: это не выдача документа, и строка
   * «отправлено» в журнале означала бы письмо участнику, которого не было.
   * Адрес сюда приходит из сессии — отправить «проверочное» письмо на чужой
   * адрес нельзя, иначе это обычная рассылка без согласия, названная иначе.
   *
   * `fileId` — тот же документ, что уйдёт участнику. Кнопка существует ровно
   * ради ответа на вопрос «что получит участник», и письмо без вложения на
   * него не отвечает.
   */
  async sendPreview(
    orgId: string,
    to: string,
    subject: string,
    html: string,
    fileId?: string | null,
  ): Promise<void> {
    const sender = await this.resolveSender(orgId);
    if (!sender) {
      throw new BadRequestException('Отправка писем не настроена — обратитесь в поддержку');
    }
    await this.providerFor('smtp').send({
      from: { email: sender.email, name: sender.displayName },
      replyTo: sender.replyTo,
      to,
      subject,
      html,
      attachments: await this.attachmentFor(orgId, fileId),
    });
  }

  /**
   * Ссылка для подтверждения адреса — вместо кода.
   *
   * Нужна, когда форма отправлена прямо на наш адрес, без нашего скрипта
   * на странице: окно с полем для кода рисует скрипт, и без него человеку
   * было бы негде этот код ввести. Ссылка закрывает вопрос одним нажатием.
   */
  async sendConfirmLink(orgId: string, to: string, url: string): Promise<void> {
    const sender = await this.resolveSender(orgId);
    if (!sender) {
      throw new BadRequestException('Отправка писем не настроена — ссылку выслать некуда');
    }

    await this.providerFor('smtp').send({
      from: { email: sender.email, name: sender.displayName },
      to,
      subject: 'Подтвердите адрес, чтобы получить документ',
      html:
        `<p style="font-size:15px">Нажмите, чтобы подтвердить адрес — и мы пришлём документ:</p>` +
        mailButton(url, 'Подтвердить и получить документ') +
        `<p style="font-size:13px;color:#36394a">Ссылка действует 10 минут. ` +
        `Если вы не запрашивали документ, просто проигнорируйте это письмо.</p>`,
    });
  }

  /**
   * Вложение по идентификатору файла — с проверкой, что файл наш.
   *
   * Файл ищется вместе с организацией из сессии, а не по одному
   * идентификатору: иначе подставленный чужой идентификатор прислал бы
   * чужой документ на свой адрес.
   */
  private async attachmentFor(
    orgId: string,
    fileId?: string | null,
  ): Promise<MailAttachment[] | undefined> {
    if (!fileId) return undefined;

    const file = await this.prisma.file.findFirst({
      where: { id: fileId, orgId, deletedAt: null },
      select: { originalName: true, s3Key: true, mime: true },
    });
    if (!file) return undefined;

    return [
      {
        filename: file.originalName || 'Документ.pdf',
        content: await this.storage.getStream(file.s3Key),
        contentType: file.mime,
      },
    ];
  }

  /**
   * Служебное уведомление самим себе — например, о новой заявке на счёт.
   * Мимо журнала писем: это внутренняя переписка, а не выдача документов.
   */
  async sendNotice(orgId: string, to: string, subject: string, body: string): Promise<void> {
    const sender = await this.resolveSender(orgId);
    if (!sender) {
      this.logger.error('Уведомление не отправлено: отправка писем не настроена');
      return;
    }
    await this.providerFor('smtp').send({
      from: { email: sender.email, name: sender.displayName },
      to,
      subject,
      html: `<pre style="font:14px/1.5 Jost,system-ui;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
    });
  }

  /** Письмо с готовым вложением — счёт, акт и прочее, чего нет в журнале выдачи. */
  async sendDocument(params: {
    orgId: string;
    to: string;
    subject: string;
    html: string;
    filename: string;
    content: Buffer;
  }): Promise<void> {
    const sender = await this.resolveSender(params.orgId);
    if (!sender) {
      this.logger.error('Документ не отправлен: отправка писем не настроена');
      return;
    }
    await this.providerFor('smtp').send({
      from: { email: sender.email, name: sender.displayName },
      replyTo: sender.replyTo,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: [
        { filename: params.filename, content: params.content, contentType: 'application/pdf' },
      ],
    });
  }

  /**
   * Служебное письмо от самого сервиса, а не от организации.
   *
   * Все прочие отправки идут с подтверждённого домена организации — правило
   * без исключений, потому что письмо о награждении должно приходить от того,
   * кто награждает. Здесь случай обратный: организация только что создана,
   * домена у неё нет и быть не может, а письмо выслать надо именно сейчас.
   * Подтверждение адреса приходит от «Вручай» — так и должно.
   *
   * Отправитель берётся из SERVICE_MAIL_FROM и на организацию не смотрит.
   */
  async sendService(to: string, subject: string, html: string): Promise<void> {
    const raw = this.config.get('SERVICE_MAIL_FROM', { infer: true });
    // Разбираем «Имя <адрес>»; если формат другой — считаем всю строку адресом.
    const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    const from = m ? { name: m[1], email: m[2] } : { name: 'Вручай', email: raw.trim() };

    await this.providerFor('smtp').send({ from, to, subject, html });
  }

  async listEmails(orgId: string, documentId?: string) {
    return this.prisma.email.findMany({
      where: { orgId, ...(documentId ? { documentId } : {}) },
      orderBy: { queuedAt: 'desc' },
      take: 200,
    });
  }
}
