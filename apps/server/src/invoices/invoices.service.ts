import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PdfRenderer } from '../generation/pdf-renderer';
import { MailService } from '../mail/mail.service';
import { redact } from '../common/redact';
import type { Env } from '../config/env';
import { renderInvoiceHtml, type SellerRequisites } from './invoice-template';

/**
 * Счета на оплату.
 *
 * Нумерация сквозная в пределах года. Номер выдаётся в транзакции с блокировкой
 * строки-счётчика: два одновременных запроса иначе получат один номер, а два
 * счёта с одним номером — это разбирательство с чужой бухгалтерией.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly renderer: PdfRenderer,
    private readonly mail: MailService,
  ) {}

  private seller(): SellerRequisites {
    return {
      name: this.config.get('SELLER_NAME', { infer: true }),
      inn: this.config.get('SELLER_INN', { infer: true }),
      ogrnip: this.config.get('SELLER_OGRNIP', { infer: true }),
      address: this.config.get('SELLER_ADDRESS', { infer: true }),
      account: this.config.get('SELLER_ACCOUNT', { infer: true }),
      bank: this.config.get('SELLER_BANK', { infer: true }),
      bik: this.config.get('SELLER_BIK', { infer: true }),
      corrAccount: this.config.get('SELLER_CORR_ACCOUNT', { infer: true }),
    };
  }

  /** Реквизиты не заданы — счёт выставлять нельзя, он будет недействительным. */
  get configured(): boolean {
    const s = this.seller();
    return Boolean(s.name && s.inn && s.account && s.bik);
  }

  async create(params: {
    leadId?: string;
    buyerName: string;
    buyerInn: string;
    email: string;
    tariff: string;
    description: string;
    amountKopecks: number;
  }) {
    const year = new Date().getFullYear();

    // Номер берётся в транзакции: параллельные заявки не должны совпасть.
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.$queryRaw<{ max: number | null }[]>`
        SELECT MAX(number) AS max FROM invoices WHERE year = ${year} FOR UPDATE
      `;
      const number = (last[0]?.max ?? 0) + 1;

      return tx.invoice.create({
        data: {
          leadId: params.leadId,
          number,
          year,
          buyerName: params.buyerName,
          buyerInn: params.buyerInn,
          email: params.email,
          tariff: params.tariff,
          description: params.description,
          amountKopecks: params.amountKopecks,
        },
      });
    });
  }

  async pdf(invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Счёт не найден');

    return this.renderer.renderHtml(
      renderInvoiceHtml(
        {
          number: invoice.number,
          year: invoice.year,
          date: invoice.createdAt,
          buyerName: invoice.buyerName,
          buyerInn: invoice.buyerInn,
          description: invoice.description,
          amountKopecks: invoice.amountKopecks,
        },
        this.seller(),
      ),
    );
  }

  /**
   * Отправка счёта покупателю. Сбой почты не отменяет счёт: он уже выставлен
   * и виден в кабинете, а письмо можно послать повторно.
   */
  async send(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Счёт не найден');

    const pdf = await this.pdf(invoiceId);
    const sender = await this.prisma.sender.findFirst({
      where: { domain: { status: 'verified' } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!sender) {
      this.logger.warn(`Счёт ${invoiceId} выставлен, но отправить некому: нет отправителя`);
      return;
    }

    await this.mail.sendDocument({
      orgId: sender.orgId,
      to: invoice.email,
      subject: `Счёт № ${invoice.number} на оплату — Вручай`,
      html:
        `<p>Здравствуйте!</p>` +
        `<p>Во вложении счёт № ${invoice.number} на тариф «${invoice.tariff}».</p>` +
        `<p><strong>В назначении платежа укажите номер счёта</strong> — тогда доступ ` +
        `включится автоматически после поступления денег.</p>` +
        `<p>Договор и договор-поручение на обработку персональных данных вышлем ` +
        `следом либо по запросу.</p>`,
      filename: `Счёт № ${invoice.number}.pdf`,
      content: pdf,
    });

    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { sentAt: new Date() } });
    this.logger.log(`Счёт ${invoice.number} отправлен`);
  }

  /** Выставить и сразу отправить. Ошибка отправки не роняет выставление. */
  async issueAndSend(params: Parameters<InvoicesService['create']>[0]): Promise<string> {
    const invoice = await this.create(params);
    void this.send(invoice.id).catch((err: unknown) => {
      this.logger.error(`Счёт ${invoice.id} не отправлен: ${redact(String(err))}`);
    });
    return invoice.id;
  }

  list(paid?: boolean) {
    return this.prisma.invoice.findMany({
      where: paid === undefined ? undefined : paid ? { paidAt: { not: null } } : { paidAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
