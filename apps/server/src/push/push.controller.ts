import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { HumansOnlyGuard } from '../auth/humans-only.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  isAllowedPushEndpoint,
  subscribeSchema,
  unsubscribeSchema,
  type SubscribeInput,
} from './push-endpoint';
import { PushService } from './push.service';

/**
 * Подписка браузера на уведомления о готовности выпуска.
 *
 * Только для вошедшего человека: подписка привязывается к userId и orgId
 * из сессии, а не из тела запроса (ADR-0004). Токену API она ни к чему —
 * у скрипта нет браузера, которому показывать уведомление.
 */
@Controller('push')
@UseGuards(AuthGuard, HumansOnlyGuard)
export class PushController {
  private readonly logger = new Logger(PushController.name);

  constructor(private readonly push: PushService) {}

  /** Открытый ключ VAPID. `null` — push на сервере выключен, кнопку не показываем. */
  @Get('key')
  key() {
    return { publicKey: this.push.publicKey() };
  }

  @Post('subscribe')
  @HttpCode(204)
  async subscribe(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(subscribeSchema)) body: SubscribeInput,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!this.push.publicKey()) throw new BadRequestException('Уведомления на этом сервере выключены');
    if (!isAllowedPushEndpoint(body.endpoint)) {
      // Хост — в журнал, чтобы дополнить список; адрес целиком не пишем.
      let host = '';
      try {
        host = new URL(body.endpoint).hostname;
      } catch {
        // Схема уже проверила, что это адрес; сюда не попадём.
      }
      this.logger.warn(`Отказано в подписке на push: незнакомый сервис доставки ${host}`);
      throw new BadRequestException('Этот браузер присылает уведомления через сервис, который мы не поддерживаем');
    }
    await this.push.subscribe(user.userId, user.orgId, body, userAgent);
  }

  @Delete('subscribe')
  @HttpCode(204)
  async unsubscribe(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(unsubscribeSchema)) body: { endpoint: string },
  ) {
    await this.push.unsubscribe(user.userId, body.endpoint);
  }
}
