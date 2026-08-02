import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { YookassaService } from './yookassa.service';

/**
 * Оплата счетов.
 *
 * Два пути, и оба ведут в одну точку — отметку об оплате на счёте:
 * автоматический, когда платёж прошёл через ЮKassa, и ручной, когда деньги
 * пришли переводом и владелец сервиса подтвердил это в кабинете.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly yookassa: YookassaService,
  ) {}

  /**
   * Подтверждение по уведомлению. Состояние берётся у платёжного сервиса,
   * а не из тела уведомления: подписи у него нет.
   */
  async confirmFromProvider(paymentId: string): Promise<void> {
    const payment = await this.yookassa.getPayment(paymentId);
    if (!payment) {
      this.logger.warn(`Платёж ${paymentId} не подтверждён: сервис не ответил`);
      return;
    }
    if (payment.status !== 'succeeded' || !payment.paid) {
      this.logger.log(`Платёж ${paymentId} в состоянии «${payment.status}» — ждём`);
      return;
    }

    const invoiceId = payment.metadata?.invoiceId;
    if (!invoiceId) {
      this.logger.warn(`Платёж ${paymentId} прошёл, но не привязан к счёту`);
      return;
    }

    // Повторные уведомления — норма, поэтому отмечаем только неоплаченный счёт.
    const updated = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, paidAt: null },
      data: { paidAt: new Date(), paymentId },
    });
    if (updated.count) this.logger.log(`Счёт ${invoiceId} оплачен, платёж ${paymentId}`);
  }

  /** Подтверждение вручную: деньги пришли переводом, это видно по выписке. */
  async confirmManually(invoiceId: string): Promise<{ ok: true }> {
    await this.prisma.invoice.updateMany({
      where: { id: invoiceId, paidAt: null },
      data: { paidAt: new Date() },
    });
    this.logger.log(`Счёт ${invoiceId} отмечен оплаченным вручную`);
    return { ok: true };
  }
}
