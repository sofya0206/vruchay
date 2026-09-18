import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailKind } from '@prisma/client';
import { baseUrl, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MailProcessor } from '../mail/mail.processor';
import { renderHtmlTemplate, renderSubject, sanitizeEmailHtml } from '../mail/mail-template';
import type { EmailStatus } from '../mail/email-status';
import { marketingSetupRefusal, renderLetterBody } from './letter-kind';
import { normalizeEmail, parseEmailList, planLetters, type Plan } from './recipients-plan';
import { MailingService } from './mailing.service';
import type { TextMailingDto } from './mailing.dto';

const LIVE_STATUSES: EmailStatus[] = ['queued', 'sent', 'delivered', 'opened'];

/**
 * Рассылка без документа: текст списку адресов.
 *
 * Приглашение на следующее мероприятие, перенос церемонии, напоминание
 * забрать грамоту — письма, к которым прикладывать нечего. Раньше
 * отправить их можно было только через материал: завести пустой макет,
 * залить таблицу, снять галочку «прикладывать документ».
 *
 * Отдельная сущность не заводится. Рассылка — это шаблон письма без
 * материала (documentId пуст, у него своё название), а письма ссылаются
 * на шаблон, как и письма материала. Очередь, отправитель, пиксель
 * прочтения, отписка и журнал — те же самые.
 *
 * Черновик правится, пока ни одно письмо не ушло. После первой отправки
 * текст замораживается: тело письма собирается из шаблона в момент
 * отправки, и правка задним числом переписала бы письма, стоящие
 * в очереди. Дослать тем, кого забыли, можно — дубли отсекает индекс.
 */
@Injectable()
export class TextMailingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly processor: MailProcessor,
    private readonly mailing: MailingService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(orgId: string, dto: TextMailingDto) {
    const data = await this.draftData(orgId, dto);
    return this.prisma.emailTemplate.create({
      data: { orgId, documentId: null, kind: dto.kind, ...data },
      select: TEMPLATE_FIELDS,
    });
  }

  async update(orgId: string, id: string, dto: TextMailingDto) {
    const template = await this.find(orgId, id);
    if (template.sent > 0) {
      throw new BadRequestException('Рассылка уже ушла, текст менять нельзя — создайте новую');
    }
    const data = await this.draftData(orgId, dto);
    return this.prisma.emailTemplate.update({
      where: { id },
      data: { kind: dto.kind, ...data },
      select: TEMPLATE_FIELDS,
    });
  }

  async get(orgId: string, id: string) {
    const template = await this.find(orgId, id);
    return { ...template, locked: template.sent > 0 };
  }

  /** Кому уйдёт и кому нет — тем же расчётом, что и отправка. */
  async audience(orgId: string, id: string, emails: string) {
    const template = await this.find(orgId, id);
    const plan = await this.plan(orgId, template, emails);
    const refusal = await this.refusal(orgId, template);

    return {
      refusal,
      willSend: plan.letters.length,
      letters: plan.letters.slice(0, 50).map((l) => ({ email: l.email, name: '' })),
      skipped: plan.skipped,
    };
  }

  async send(orgId: string, id: string, emails: string) {
    const template = await this.find(orgId, id);

    const refusal = await this.refusal(orgId, template);
    if (refusal) throw new BadRequestException(refusal);

    const plan = await this.plan(orgId, template, emails);

    // Общий домен делят все организации — объём с него ограничен
    // так же, как у рассылки материалов.
    if (!template.senderId) {
      const volume = await this.mail.volumeRefusal(orgId, plan.letters.length);
      if (volume) throw new BadRequestException(volume);
    }

    // Та же вставка с пропуском дублей, что у рассылки материалов:
    // индекс emails_template_to_kind_live закрывает двойное нажатие.
    const created = await this.prisma.email.createManyAndReturn({
      data: plan.letters.map((letter) => ({
        orgId,
        documentId: null,
        templateId: template.id,
        kind: template.kind,
        toEmail: letter.email,
        subject: renderSubject(template.subject, letter.data),
        attachFile: false,
        provider: 'smtp',
      })),
      skipDuplicates: true,
      select: { id: true },
    });
    await Promise.all(created.map((e) => this.processor.enqueue(e.id)));

    return { name: template.name ?? '', queued: created.length, skipped: plan.skipped };
  }

  /**
   * Письмо себе. Адрес — из сессии: проверка на чужой адрес была бы
   * рассылкой без согласия под другим названием.
   */
  async testSend(orgId: string, toEmail: string, id: string) {
    const template = await this.find(orgId, id);
    const data = { email: toEmail };
    const body = renderHtmlTemplate(template.bodyHtml, data);
    const html = renderLetterBody(
      template.kind === 'marketing'
        ? {
            kind: 'marketing',
            bodyHtml: body,
            advertiserName: template.advertiserName ?? '',
            unsubscribeUrl: `${baseUrl(this.config.get('PUBLIC_URL', { infer: true }))}/api/v1/u/preview`,
          }
        : { kind: 'transactional', bodyHtml: body },
    );

    await this.mail.sendPreview(
      orgId,
      toEmail,
      `[Проверка] ${renderSubject(template.subject, data)}`,
      html,
      null,
    );
    return { to: toEmail };
  }

  // ─── Внутреннее ──────────────────────────────────────────────────────────

  /**
   * Рассылка организации — или 404.
   *
   * Шаблон материала сюда не проходит: у него свой поток, свой список
   * получателей и своё вложение, и слать его «списком адресов» мимо
   * таблицы значит разослать грамоты без грамот.
   */
  private async find(orgId: string, id: string) {
    const template = await this.prisma.emailTemplate.findFirst({
      where: { id, orgId, documentId: null, name: { not: null } },
      select: { ...TEMPLATE_FIELDS, _count: { select: { emails: true } } },
    });
    if (!template) throw new NotFoundException('Рассылка не найдена');
    const { _count, ...rest } = template;
    return { ...rest, sent: _count.emails };
  }

  private async draftData(orgId: string, dto: TextMailingDto) {
    if (dto.senderId) {
      const sender = await this.prisma.sender.findFirst({ where: { id: dto.senderId, orgId } });
      if (!sender) throw new NotFoundException('Отправитель не найден');
    }

    const advertiserName = dto.kind === 'marketing' ? dto.advertiserName.trim() : null;
    if (dto.kind === 'marketing') {
      const refusal = marketingSetupRefusal(advertiserName);
      if (refusal) throw new BadRequestException(refusal);
    }

    return {
      name: dto.name,
      subject: dto.subject,
      bodyHtml: sanitizeEmailHtml(dto.bodyHtml),
      senderId: dto.senderId ?? null,
      advertiserName,
      attachGeneratedFile: false,
    };
  }

  private async refusal(
    orgId: string,
    template: { senderId: string | null; kind: EmailKind; advertiserName: string | null },
  ) {
    return (
      (await this.mail.sendingRefusal(orgId, template.senderId)) ??
      (template.kind === 'marketing' ? marketingSetupRefusal(template.advertiserName) : null)
    );
  }

  private async plan(
    orgId: string,
    template: { id: string; kind: EmailKind },
    emails: string,
  ): Promise<Plan> {
    const sent = await this.prisma.email.findMany({
      where: { orgId, templateId: template.id, documentId: null, status: { in: LIVE_STATUSES } },
      select: { toEmail: true },
    });

    return planLetters({
      source: 'manual',
      rows: [],
      manualEmails: parseEmailList(emails),
      requireFile: false,
      alreadySent: new Set(sent.map((e) => normalizeEmail(e.toEmail))),
      alreadySentReason: 'в этой рассылке письмо на этот адрес уже уходило',
      consented:
        template.kind === 'marketing' ? await this.mailing.consentedAddresses(orgId) : null,
    });
  }
}

const TEMPLATE_FIELDS = {
  id: true,
  name: true,
  kind: true,
  subject: true,
  bodyHtml: true,
  advertiserName: true,
  senderId: true,
  createdAt: true,
} as const;
