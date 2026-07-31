import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SmtpProvider } from './smtp.provider';
import {
  isValidEmail,
  renderHtmlTemplate,
  renderSubject,
  sanitizeEmailHtml,
} from './mail-template';
import type { MailProvider } from './mail-provider.interface';
import { redact } from '../common/redact';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly smtp: SmtpProvider,
  ) {}

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
    // иначе можно было бы слать письма от имени чужой федерации.
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

    const existing = await this.prisma.emailTemplate.findFirst({ where: { orgId, documentId } });
    if (existing) {
      return this.prisma.emailTemplate.update({ where: { id: existing.id }, data: clean });
    }
    return this.prisma.emailTemplate.create({ data: { orgId, documentId, ...clean } });
  }

  async getTemplate(orgId: string, documentId: string) {
    return this.prisma.emailTemplate.findFirst({
      where: { orgId, documentId },
      include: { sender: true },
    });
  }

  // ─── Постановка писем в очередь ──────────────────────────────────────────

  /**
   * Ставит письма отмеченным получателям, у которых уже есть готовый файл.
   * Возвращает разбор: сколько поставлено и почему остальные пропущены —
   * «отправлено 47 из 50» без объяснения оставшихся трёх бесполезно.
   */
  async queueForDocument(orgId: string, documentId: string) {
    const template = await this.getTemplate(orgId, documentId);
    if (!template) throw new BadRequestException('Сначала настройте шаблон письма');
    if (!template.sender) throw new BadRequestException('В шаблоне не выбран отправитель');

    // Домен мог быть подтверждён раньше, а потом записи из DNS убрали.
    // Проверяем перед каждой рассылкой, а не только при создании отправителя.
    const domain = await this.prisma.mailDomain.findFirst({
      where: { id: template.sender.domainId, orgId },
      select: { status: true, domain: true },
    });
    if (domain?.status !== 'verified') {
      throw new BadRequestException(
        `Домен ${domain?.domain ?? ''} не подтверждён — отправка невозможна`,
      );
    }

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
            toEmail: item.email,
            subject: renderSubject(template.subject, item.data),
            provider: this.providerFor('smtp').name,
          },
        }),
      ),
    );

    return { queued: created.length, skipped, emailIds: created.map((e) => e.id) };
  }

  /** Отправка одного письма. Вызывается воркером. */
  async sendOne(emailId: string): Promise<void> {
    const email = await this.prisma.email.findUnique({
      where: { id: emailId },
      include: { template: { include: { sender: true } }, file: true },
    });
    if (!email || !email.template?.sender) return;

    const row = email.rowId
      ? await this.prisma.recipientRow.findUnique({ where: { id: email.rowId } })
      : null;
    const data = (row?.data as Record<string, string>) ?? {};

    try {
      const attachments = email.file
        ? [
            {
              filename: email.file.originalName || 'Документ.pdf',
              content: await this.storage.getStream(email.file.s3Key),
              contentType: email.file.mime,
            },
          ]
        : undefined;

      const { providerMessageId } = await this.providerFor(email.provider).send({
        from: { email: email.template.sender.email, name: email.template.sender.displayName },
        to: email.toEmail,
        subject: email.subject,
        html: renderHtmlTemplate(email.template.bodyHtml, data),
        attachments,
        reference: email.id,
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
      this.logger.warn(`Письмо ${emailId} не отправлено: ${message}`);
      await this.prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'failed',
          error: message.slice(0, 500),
          statusUpdatedAt: new Date(),
        },
      });
    }
  }

  async listEmails(orgId: string, documentId?: string) {
    return this.prisma.email.findMany({
      where: { orgId, ...(documentId ? { documentId } : {}) },
      orderBy: { queuedAt: 'desc' },
      take: 200,
    });
  }
}
