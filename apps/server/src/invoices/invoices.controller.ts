import { Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformOnlyGuard } from '../auth/platform-only.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { uuidSchema } from '../documents/documents.dto';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from '../payments/payments.service';

const uuidParam = new ZodValidationPipe(uuidSchema);

/**
 * Счета в кабинете. Видит и подтверждает только владелец сервиса: это
 * его собственная бухгалтерия, а не данные организации-клиента.
 *
 * Раньше здесь стояли только AuthGuard и роль «владелец» — а это значит
 * «владелец любой организации». С открытой регистрацией любой желающий
 * заводил себе организацию и читал всю нашу клиентскую книгу: имена
 * покупателей, ИНН, адреса, суммы. PlatformOnlyGuard проверяет, что
 * человек из нашей организации, а не просто владелец своей.
 */
@Controller('invoices')
@UseGuards(AuthGuard, PlatformOnlyGuard, RolesGuard)
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  @Roles('owner', 'admin')
  list(@Query('paid') paid?: string) {
    return this.invoices.list(paid === undefined ? undefined : paid === 'true');
  }

  @Get(':id/pdf')
  @Roles('owner', 'admin')
  async pdf(@Param('id', uuidParam) id: string, @Res() reply: FastifyReply): Promise<void> {
    const body = await this.invoices.pdf(id);
    await reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', 'inline')
      .header('cache-control', 'no-store')
      .send(body);
  }

  /** Повторная отправка: письмо могло не дойти или потеряться у клиента. */
  @Post(':id/send')
  @Roles('owner', 'admin')
  async resend(@Param('id', uuidParam) id: string) {
    await this.invoices.send(id);
    return { ok: true };
  }

  /**
   * Отметка об оплате вручную — для переводов, которые автомат не сопоставил:
   * назначение платежа без номера счёта, частичная оплата, переплата.
   */
  @Post(':id/paid')
  @Roles('owner', 'admin')
  markPaid(@Param('id', uuidParam) id: string) {
    return this.payments.confirmManually(id);
  }
}
