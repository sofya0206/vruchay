import { Body, Controller, HttpCode, Logger, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { PaymentsService } from './payments.service';

/**
 * Уведомления от ЮKassa.
 *
 * Тело запроса здесь — только подсказка «посмотри платёж такой-то»: ЮKassa
 * уведомления не подписывает, и поверить им значит позволить любому желающему
 * включить себе оплаченный тариф. Состояние платежа перепроверяется запросом
 * к их API по нашему ключу.
 *
 * Отвечаем 200 всегда, когда запрос разобран: иначе ЮKassa будет слать
 * повторы сутками. Разбираться с неизвестным платежом — наша забота,
 * а не повод заставлять их стучаться снова.
 */
@Controller('v1/payments')
@UseGuards(ThrottleGuard)
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly payments: PaymentsService) {}

  @Post('yookassa')
  @HttpCode(200)
  @Throttle({ max: 120, timeWindow: '5 minutes' })
  async webhook(@Body() body: unknown, @Req() req: FastifyRequest): Promise<{ ok: true }> {
    const id = extractPaymentId(body);
    if (!id) {
      this.logger.warn(`Уведомление без идентификатора платежа с адреса ${req.ip}`);
      return { ok: true };
    }
    await this.payments.confirmFromProvider(id);
    return { ok: true };
  }
}

/** Достаёт идентификатор платежа, ничему в теле больше не доверяя. */
function extractPaymentId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const object = (body as { object?: { id?: unknown } }).object;
  const id = object?.id;
  return typeof id === 'string' && id.length > 0 && id.length < 100 ? id : null;
}
