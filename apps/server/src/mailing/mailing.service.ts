import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { EmailKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MailProcessor } from '../mail/mail.processor';
import { renderHtmlTemplate, renderSubject, sanitizeEmailHtml } from '../mail/mail-template';
import type { EmailStatus } from '../mail/email-status';
import { deliveryProblem } from './bounce-reason';
import {
  marketingSetupRefusal,
  renderLetterBody,
  templateKindRefusal,
  type LetterKind,
} from './letter-kind';
import { normalizeEmail, parseEmailList, planLetters, type Plan, type PlanRow } from './recipients-plan';
import type { SendDto, TemplateDto } from './mailing.dto';

/** Кому шлём и чем: общая часть проверки и отправки. */
interface PlanRequest {
  kind: LetterKind;
  source: 'table' | 'manual';
  emails?: string;
}

/** Состояния, при которых письмо считается уже ушедшим на этот адрес. */
const LIVE_STATUSES: EmailStatus[] = ['queued', 'sent', 'delivered', 'opened'];

/**
 * Массовая рассылка документов отдельным разделом.
 *
 * Отличие от отправки со страницы материала не в количестве кнопок:
 * там рассылка — продолжение выпуска, здесь она сама по себе. Файлы
 * почти всегда делают заранее, а рассылают в день награждения, и человеку,
 * пришедшему разослать, незачем идти через редактор макета.
 *
 * Отправку заново не изобретаем: письма ставятся в ту же очередь
 * (MailProcessor) и уходят тем же MailService.sendOne — с тем же
 * ограничением частоты и той же обработкой отказов.
 */
@Injectable()
export class MailingService {
  private readonly logger = new Logger(MailingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly processor: MailProcessor,
  ) {}

  // ─── Шаблоны писем по потокам ────────────────────────────────────────────

  async getTemplate(orgId: string, documentId: string, kind: LetterKind) {
    await this.assertDocument(orgId, documentId);
    return this.prisma.emailTemplate.findFirst({
      where: { orgId, documentId, kind },
      include: { sender: true },
    });
  }

  /**
   * Сохранение шаблона в свой поток.
   *
   * Рекламный и транзакционный тексты живут отдельными записями и никогда
   * не перезаписывают друг друга: правка рекламного письма не должна
   * менять письмо о выдаче документа — оно уходит всем и без согласия.
   */
  async saveTemplate(orgId: string, documentId: string, dto: TemplateDto) {
    await this.assertDocument(orgId, documentId);

    if (dto.senderId) {
      const sender = await this.prisma.sender.findFirst({ where: { id: dto.senderId, orgId } });
      if (!sender) throw new NotFoundException('Отправитель не найден');
    }

    const advertiserName = dto.kind === 'marketing' ? dto.advertiserName.trim() : null;
    if (dto.kind === 'marketing') {
      const refusal = marketingSetupRefusal(advertiserName);
      if (refusal) throw new BadRequestException(refusal);
    }

    const data = {
      senderId: dto.senderId ?? null,
      subject: dto.subject,
      // Чистим при сохранении, а не при отправке: человек сразу видит,
      // что сохранилось, и не обнаруживает пропажу разметки в момент рассылки.
      bodyHtml: sanitizeEmailHtml(dto.bodyHtml),
      attachGeneratedFile: dto.attachGeneratedFile,
      advertiserName,
    };

    const existing = await this.prisma.emailTemplate.findFirst({
      where: { orgId, documentId, kind: dto.kind },
      select: { id: true },
    });

    return existing
      ? this.prisma.emailTemplate.update({ where: { id: existing.id }, data })
      : this.prisma.emailTemplate.create({
          data: { orgId, documentId, kind: dto.kind, ...data },
        });
  }

  // ─── Проверка до отправки ────────────────────────────────────────────────

  /**
   * Кому уйдёт и кому не уйдёт — до нажатия «Отправить».
   *
   * Тот же расчёт, что и при отправке, тем же кодом: показать одно,
   * а отправить другое здесь нельзя по построению.
   */
  async audience(orgId: string, documentId: string, request: PlanRequest) {
    const doc = await this.assertDocument(orgId, documentId);
    const template = await this.prisma.emailTemplate.findFirst({
      where: { orgId, documentId, kind: request.kind },
      include: { sender: true },
    });

    if (!template) {
      return {
        documentId,
        title: doc.title,
        refusal:
          request.kind === 'marketing'
            ? 'Рекламное письмо для этого материала не настроено'
            : 'Сначала настройте письмо',
        willSend: 0,
        letters: [],
        skipped: [],
      };
    }

    const plan = await this.plan(orgId, documentId, request, template);
    const refusal =
      (await this.mail.sendingRefusal(orgId, template.senderId)) ??
      (template.kind === 'marketing' ? marketingSetupRefusal(template.advertiserName) : null);

    return {
      documentId,
      title: doc.title,
      refusal,
      willSend: plan.letters.length,
      // Список показываем не целиком: при десяти тысячах получателей он
      // не нужен ни человеку, ни браузеру. Пропущенных отдаём всех —
      // ради них проверка и затевалась.
      letters: plan.letters.slice(0, 50).map((l) => ({ email: l.email, name: l.data.name ?? '' })),
      skipped: plan.skipped,
    };
  }

  // ─── Отправка ────────────────────────────────────────────────────────────

  /**
   * Разослать выбранные материалы.
   *
   * По материалу на письмо: у каждого свой текст, своё вложение и свой
   * список пропущенных. Один общий счётчик «отправлено 300» скрыл бы,
   * что по второму материалу не ушло ничего.
   */
  async send(orgId: string, dto: SendDto) {
    const results = [];

    for (const documentId of dto.documentIds) {
      const doc = await this.assertDocument(orgId, documentId);
      const template = await this.prisma.emailTemplate.findFirst({
        where: { orgId, documentId, kind: dto.kind },
        include: { sender: true },
      });
      if (!template) {
        throw new BadRequestException(
          `Для материала «${doc.title}» письмо не настроено`,
        );
      }

      // Поток письма и поток отправки обязаны совпадать. Проверка здесь
      // избыточна — шаблон и так выбран по потоку, — но она дешёвая,
      // а цена ошибки в этом месте измеряется сотнями тысяч рублей.
      const kindRefusal = templateKindRefusal(dto.kind, template.kind);
      if (kindRefusal) throw new BadRequestException(kindRefusal);

      if (template.kind === 'marketing') {
        const setup = marketingSetupRefusal(template.advertiserName);
        if (setup) throw new BadRequestException(setup);
      }

      const refusal = await this.mail.sendingRefusal(orgId, template.senderId);
      if (refusal) throw new BadRequestException(refusal);

      const plan = await this.plan(
        orgId,
        documentId,
        { kind: dto.kind, source: dto.source, emails: dto.emails },
        template,
      );

      // Объём с общего домена ограничен: пока у организации нет своего
      // домена, репутация noreply@vruchay.ru общая на всех.
      if (!template.senderId) {
        const volume = await this.mail.volumeRefusal(orgId, plan.letters.length);
        if (volume) throw new BadRequestException(volume);
      }

      const emailIds = await this.createEmails(orgId, documentId, template, plan);
      await Promise.all(emailIds.map((id) => this.processor.enqueue(id)));

      results.push({
        documentId,
        title: doc.title,
        queued: emailIds.length,
        skipped: plan.skipped,
      });
    }

    return { results, queued: results.reduce((sum, r) => sum + r.queued, 0) };
  }

  /**
   * Письмо себе для проверки.
   *
   * Идёт мимо очереди и мимо журнала доставки: это не выдача документа,
   * а взгляд на письмо своими глазами. В журнале такие письма создавали бы
   * ложные строки — «отправлено» тому, кто ничего не получал.
   *
   * Адрес берём из сессии, а не из запроса: «тестовая отправка» на чужой
   * адрес — это рассылка без согласия, только названная иначе.
   */
  async testSend(orgId: string, toEmail: string, documentId: string, kind: LetterKind) {
    const doc = await this.assertDocument(orgId, documentId);
    const template = await this.prisma.emailTemplate.findFirst({
      where: { orgId, documentId, kind },
    });
    if (!template) throw new BadRequestException('Сначала настройте письмо');

    const sample = await this.prisma.recipientRow.findFirst({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: { data: true },
    });
    const data = (sample?.data as Record<string, string>) ?? {};

    const body = renderHtmlTemplate(template.bodyHtml, data);
    const html = renderLetterBody(
      template.kind === 'marketing'
        ? {
            kind: 'marketing',
            bodyHtml: body,
            advertiserName: template.advertiserName ?? '',
            // Ссылка отписки в проверочном письме ведёт в никуда намеренно:
            // письма в журнале нет, отписываться не от чего.
            unsubscribeUrl: `${process.env.PUBLIC_URL ?? ''}/api/v1/u/preview`,
          }
        : { kind: 'transactional', bodyHtml: body },
    );

    await this.mail.sendPreview(
      orgId,
      toEmail,
      `[Проверка] ${renderSubject(template.subject, data)}`,
      html,
    );

    return { to: toEmail, title: doc.title };
  }

  /**
   * Переотправить недоставленные.
   *
   * Новыми письмами, а не сменой состояния у старых: журнал обязан
   * помнить, что первая попытка была и чем кончилась. Безнадёжные адреса
   * не трогаем — повторная отправка на несуществующий ящик ничего не
   * доставит, зато испортит репутацию домена, с которой потом не
   * разобраться. Про них честно говорим, что чинить надо в таблице.
   */
  async resendFailed(orgId: string, documentId: string) {
    const doc = await this.assertDocument(orgId, documentId);

    const failed = await this.prisma.email.findMany({
      where: { orgId, documentId, status: { in: ['bounced', 'failed'] } },
      orderBy: { queuedAt: 'asc' },
      include: { template: true },
    });

    // Последняя попытка по каждому адресу: если после провала письмо
    // уже переотправляли и оно ушло, повторять снова не надо.
    const live = new Set(
      (
        await this.prisma.email.findMany({
          where: { orgId, documentId, status: { in: LIVE_STATUSES } },
          select: { toEmail: true },
        })
      ).map((e) => e.toEmail),
    );

    const attempts = new Map<string, (typeof failed)[number]>();
    for (const email of failed) {
      if (!live.has(email.toEmail)) attempts.set(email.toEmail, email);
    }

    const hopeless: { name: string; email: string; reason: string }[] = [];
    const retry: (typeof failed)[number][] = [];

    for (const email of attempts.values()) {
      const problem = deliveryProblem(email.status as EmailStatus, email.error);
      if (problem && !problem.retryable) {
        hopeless.push({ name: '', email: email.toEmail, reason: problem.reason });
        continue;
      }
      retry.push(email);
    }

    const created = await this.prisma.$transaction(
      retry.map((email) =>
        this.prisma.email.create({
          data: {
            orgId,
            documentId: email.documentId,
            rowId: email.rowId,
            templateId: email.templateId,
            fileId: email.fileId,
            // Поток берём у прошлой попытки: переотправка не меняет того,
            // чем письмо было.
            kind: email.kind,
            toEmail: email.toEmail,
            subject: email.subject,
            provider: email.provider,
          },
          select: { id: true },
        }),
      ),
    );

    await Promise.all(created.map((e) => this.processor.enqueue(e.id)));

    return { title: doc.title, queued: created.length, skipped: hopeless };
  }

  // ─── Журнал доставки ─────────────────────────────────────────────────────

  /**
   * Что с письмами.
   *
   * Причину недоставки переводим на человеческий здесь, а не в браузере:
   * тот же перевод понадобится выгрузке и поддержке, а два разных списка
   * причин разъедутся на второй правке.
   */
  async log(orgId: string, filters: { documentId?: string; problemsOnly?: boolean }) {
    if (filters.documentId) await this.assertDocument(orgId, filters.documentId);

    const where: Prisma.EmailWhereInput = {
      orgId,
      ...(filters.documentId ? { documentId: filters.documentId } : {}),
      ...(filters.problemsOnly ? { status: { in: ['bounced', 'failed'] } } : {}),
    };

    const emails = await this.prisma.email.findMany({
      where,
      orderBy: { queuedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        documentId: true,
        toEmail: true,
        subject: true,
        status: true,
        kind: true,
        error: true,
        queuedAt: true,
        sentAt: true,
      },
    });

    const titles = await this.documentTitles(
      orgId,
      emails.map((e) => e.documentId).filter((id): id is string => Boolean(id)),
    );

    const counts = await this.prisma.email.groupBy({
      by: ['status'],
      where: { orgId, ...(filters.documentId ? { documentId: filters.documentId } : {}) },
      _count: { _all: true },
    });

    return {
      items: emails.map((email) => {
        const problem = deliveryProblem(email.status as EmailStatus, email.error);
        return {
          id: email.id,
          documentId: email.documentId,
          documentTitle: email.documentId ? (titles.get(email.documentId) ?? '') : '',
          toEmail: email.toEmail,
          subject: email.subject,
          status: email.status,
          kind: email.kind,
          queuedAt: email.queuedAt,
          sentAt: email.sentAt,
          problem,
        };
      }),
      summary: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    };
  }

  // ─── Отказ от рассылки ───────────────────────────────────────────────────

  /**
   * Отписка по ссылке из рекламного письма.
   *
   * Пишем отказ в журнал согласий, а не удаляем адрес: доказывать
   * придётся не отсутствие записи, а наличие отказа с датой.
   *
   * Про несуществующее письмо отвечаем ровно то же самое, что про
   * существующее: иначе перебор ссылок сообщал бы, кому мы писали.
   */
  async unsubscribe(emailId: string, meta: { ip?: string; userAgent?: string }) {
    const email = await this.prisma.email.findUnique({
      where: { id: emailId },
      select: { orgId: true, documentId: true, toEmail: true, kind: true },
    });
    if (!email || email.kind !== 'marketing') return;

    try {
      await this.prisma.consent.create({
        data: {
          orgId: email.orgId,
          documentId: email.documentId,
          subjectEmail: email.toEmail,
          purpose: 'marketing',
          granted: false,
          textVersion: 'unsubscribe-link-v1',
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });
    } catch (err) {
      // Отписка не должна падать в лицо человеку: он своё дело сделал.
      // Разбираться с записью — наша забота, а не его.
      this.logger.error(`Отписка ${emailId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Внутреннее ──────────────────────────────────────────────────────────

  private async assertDocument(orgId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, orgId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!doc) throw new NotFoundException('Материал не найден');
    return doc;
  }

  private async documentTitles(orgId: string, ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const docs = await this.prisma.document.findMany({
      where: { id: { in: [...new Set(ids)] }, orgId },
      select: { id: true, title: true },
    });
    return new Map(docs.map((d) => [d.id, d.title]));
  }

  /** Расчёт рассылки: одинаковый для проверки и для отправки. */
  private async plan(
    orgId: string,
    documentId: string,
    request: PlanRequest,
    template: { kind: EmailKind; attachGeneratedFile: boolean },
  ): Promise<Plan> {
    const rows: PlanRow[] =
      request.source === 'table'
        ? (
            await this.prisma.recipientRow.findMany({
              where: { documentId, checked: true, document: { orgId, deletedAt: null } },
              orderBy: { position: 'asc' },
              select: { id: true, data: true, lastFileId: true },
            })
          ).map((row) => ({
            id: row.id,
            data: row.data as Record<string, string>,
            lastFileId: row.lastFileId,
          }))
        : // Для списка адресов таблица тоже нужна: адрес, который в ней есть,
          // получит своё имя и свой выпущенный документ.
          (
            await this.prisma.recipientRow.findMany({
              where: { documentId, document: { orgId, deletedAt: null } },
              orderBy: { position: 'asc' },
              select: { id: true, data: true, lastFileId: true },
            })
          ).map((row) => ({
            id: row.id,
            data: row.data as Record<string, string>,
            lastFileId: row.lastFileId,
          }));

    return planLetters({
      source: request.source,
      rows,
      manualEmails: request.emails ? parseEmailList(request.emails) : [],
      requireFile: template.attachGeneratedFile,
      alreadySent: await this.sentAddresses(orgId, documentId),
      consented: template.kind === 'marketing' ? await this.consentedAddresses(orgId) : null,
    });
  }

  /** Адреса, которым по этому материалу письмо уже ушло или вот-вот уйдёт. */
  private async sentAddresses(orgId: string, documentId: string): Promise<Set<string>> {
    const sent = await this.prisma.email.findMany({
      where: { orgId, documentId, status: { in: LIVE_STATUSES } },
      select: { toEmail: true },
    });
    return new Set(sent.map((e) => normalizeEmail(e.toEmail)));
  }

  /**
   * Кто согласен получать рекламу.
   *
   * Считаем по последней записи для адреса: согласие дают на форме,
   * отзывают ссылкой в письме, и порядок здесь решает всё. Записи
   * перебираем по возрастанию, поэтому поздняя перекрывает раннюю.
   */
  private async consentedAddresses(orgId: string): Promise<Set<string>> {
    const consents = await this.prisma.consent.findMany({
      where: { orgId, purpose: 'marketing' },
      orderBy: { createdAt: 'asc' },
      select: { subjectEmail: true, granted: true },
    });

    const granted = new Set<string>();
    for (const consent of consents) {
      const email = normalizeEmail(consent.subjectEmail);
      if (consent.granted) granted.add(email);
      else granted.delete(email);
    }
    return granted;
  }

  private async createEmails(
    orgId: string,
    documentId: string,
    template: { id: string; kind: EmailKind; subject: string },
    plan: Plan,
  ): Promise<string[]> {
    const created = await this.prisma.$transaction(
      plan.letters.map((letter) =>
        this.prisma.email.create({
          data: {
            orgId,
            documentId,
            rowId: letter.rowId,
            templateId: template.id,
            fileId: letter.fileId,
            kind: template.kind,
            toEmail: letter.email,
            subject: renderSubject(template.subject, letter.data),
            provider: 'smtp',
          },
          select: { id: true },
        }),
      ),
    );
    return created.map((e) => e.id);
  }
}
