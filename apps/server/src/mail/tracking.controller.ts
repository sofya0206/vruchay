import { Controller, Get, Header, Param, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { MailService } from './mail.service';
import { PIXEL_GIF, PIXEL_MIME } from './open-tracking';

/** Идентификатор приходит с расширением: `.gif` отрезаем перед разбором. */
const emailIdParam = new ZodValidationPipe(
  z
    .string()
    .transform((v) => v.replace(/\.gif$/i, ''))
    .pipe(z.string().uuid()),
);

/**
 * Отметка о прочтении письма.
 *
 * Открыт без входа по необходимости: обращается почтовый клиент участника,
 * у которого нет и не будет учётной записи.
 *
 * Картинку отдаём **всегда** — и при неизвестном идентификаторе тоже.
 * Иначе разница между ответами превратила бы адрес в способ проверять,
 * какие письма существуют. По той же причине ответ не зависит от того,
 * записали мы событие или нет.
 *
 * Единственное исключение — превышенная частота: она одинакова для любого
 * идентификатора и потому ничего о письмах не сообщает. Без неё отметка
 * оставалась единственным адресом, который пишет в базу без входа и без
 * всякого ограничения.
 */
@Controller('v1/t')
@UseGuards(ThrottleGuard)
export class TrackingController {
  constructor(private readonly mail: MailService) {}

  /*
   * Предел взят с запасом: за картинкой ходит не только почтовый клиент
   * участника, но и общий шлюз изображений почтовой службы, а за ним —
   * открытия писем множества разных людей с одного адреса. Шестьдесят
   * обращений в минуту такой поток проходит свободно.
   *
   * Что теряется при упоре в предел — отметка о прочтении, то есть
   * статистика. Что защищается — запись в базу с адреса без входа.
   * Обмен верный: письмо и документ от несосчитанного открытия
   * не страдают, а неограниченная запись в базу страдает всем.
   */
  @Get('o/:emailId')
  @Throttle({ max: 60, timeWindow: '1 minute' })
  @Header('Content-Type', PIXEL_MIME)
  // Кэш запрещаем: иначе клиент показал бы картинку из кэша, и повторное
  // открытие письма прошло бы мимо нас. Обойти кэширование на стороне
  // Gmail это всё равно не поможет, но своё мы не портим.
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @Header('Content-Length', String(PIXEL_GIF.length))
  async open(@Param('emailId', emailIdParam) emailId: string, @Res() reply: FastifyReply) {
    // Отметку ставим, не дожидаясь ответа базы: картинка должна уйти быстро,
    // а если запись не удалась — письмо от этого не пострадает.
    void this.mail.markOpened(emailId);
    return reply.send(PIXEL_GIF);
  }
}
