import { Controller, Get, Header, Param, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RecipientService } from './recipient.service';

/** Токен — две части base64url через точку; всё остальное отсекаем до разбора. */
const tokenParam = new ZodValidationPipe(z.string().regex(/^[A-Za-z0-9_-]{1,400}\.[A-Za-z0-9_-]{1,100}$/, 'Некорректная ссылка'));

/**
 * Страница получателя: «ваш документ» по ссылке из письма, без входа.
 *
 * Публичный маршрут — под ограничением частоты, как проверка по QR.
 */
@Controller('v1/recipient')
@UseGuards(ThrottleGuard)
export class RecipientController {
  constructor(private readonly recipient: RecipientService) {}

  @Get(':token')
  @Throttle({ max: 60, timeWindow: '5 minutes' })
  @Header('cache-control', 'no-store')
  info(@Param('token', tokenParam) token: string) {
    return this.recipient.info(token);
  }

  @Get(':token/pdf')
  @Throttle({ max: 30, timeWindow: '10 minutes' })
  async pdf(@Param('token', tokenParam) token: string, @Res() reply: FastifyReply): Promise<void> {
    const file = await this.recipient.pdf(token);
    await reply
      .header('content-type', file.mime)
      // `inline`, а не `attachment`: на iPhone ссылка на PDF открывается
      // в просмотрщике Safari, откуда файл сохраняют через «Поделиться».
      // Скачивания по ссылке там нет вовсе.
      .header('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
      .header('cache-control', 'no-store')
      .send(file.stream);
  }
}
