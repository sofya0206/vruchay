import { Controller, Get, Header, Param, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { escapeHtml } from '../mail/mail-template';
import { MailingService } from './mailing.service';

const emailIdParam = new ZodValidationPipe(z.string().uuid());

/**
 * Отказ от рекламной рассылки по ссылке из письма.
 *
 * Открыт без входа: ссылку жмёт участник, у которого нет и не будет
 * учётной записи. Без работающего отказа рекламная рассылка незаконна
 * независимо от того, было согласие или нет.
 *
 * Отписка в два шага, и это не лишний клик. Ссылки из писем открывают
 * не только люди: почтовые сканеры и антивирусы обходят их сами, до того
 * как письмо увидит человек. Отписка по первому же обращению означала бы,
 * что участника отписал робот, а участник об этом даже не узнал.
 *
 * Про несуществующее письмо отвечаем ровно то же, что про существующее:
 * иначе перебор ссылок сообщал бы, кому и что мы отправляли.
 */
@Controller('v1/u')
@UseGuards(ThrottleGuard)
export class UnsubscribeController {
  constructor(private readonly mailing: MailingService) {}

  @Get(':emailId')
  @Throttle({ max: 30, timeWindow: '5 minutes' })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  @Header('Cache-Control', 'no-store')
  ask(@Param('emailId', emailIdParam) emailId: string) {
    return page(
      'Отказ от рассылки',
      '<p>Нажмите кнопку, чтобы больше не получать рекламные письма от этой организации.</p>' +
        '<p class="muted">Письма о выданных вам документах при этом продолжат приходить: ' +
        'это не реклама, а сообщения по существу.</p>' +
        `<p><a class="button" href="/api/v1/u/${escapeHtml(emailId)}/confirm">Отписаться</a></p>`,
    );
  }

  /*
   * Подтверждение отписки. Ограничение — на обоих шагах: раньше счётчик
   * здесь вызывался, но его ответ никто не смотрел, и запрос шёл дальше
   * в любом случае, а первый шаг не считался вовсе.
   *
   * Тридцать обращений за пять минут с одного адреса — с большим запасом
   * на человека, который жмёт кнопку по нескольку раз, и мало для перебора
   * идентификаторов писем.
   */
  @Get(':emailId/confirm')
  @Throttle({ max: 30, timeWindow: '5 minutes' })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  @Header('Cache-Control', 'no-store')
  async confirm(@Param('emailId', emailIdParam) emailId: string, @Req() req: FastifyRequest) {
    await this.mailing.unsubscribe(emailId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return page(
      'Вы отписаны',
      '<p>Готово. Рекламные письма от этой организации больше не придут.</p>' +
        '<p class="muted">Письма о выданных вам документах продолжат приходить.</p>',
    );
  }
}

/**
 * Страница отписки.
 *
 * Совсем простая и без сценариев: её открывает человек из почты, часто
 * с телефона и часто в стороннем браузере почтового клиента. Оформление
 * задано одним набором правил прямо здесь — тянуть сюда сборку кабинета
 * ради двух абзацев не за чем.
 */
function page(title: string, body: string): string {
  return (
    '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex">' +
    `<title>${escapeHtml(title)} — Вручай</title>` +
    // Шрифт интерфейса. Файл собирает scripts/fetch-fonts.mjs и раздаёт тот же
    // домен, что и кабинет: страница живёт под /api, а не на стороннем адресе.
    '<link rel="stylesheet" href="/interface-font.css">' +
    '<style>' +
    // Цвета — из UI-кита кабинета (apps/web/src/index.css): страницу
    // открывают из письма, чаще всего с телефона, и она должна быть
    // тем же «Вручай», а не чужим сайтом.
    'body{margin:0;padding:24px 16px;background:#f5f3ff;color:#091135;' +
    "font:16px/1.6 'Jost',system-ui,-apple-system,'Segoe UI',sans-serif}" +
    'main{max-width:32rem;margin:0 auto;background:#fff;border-radius:16px;padding:28px 24px;' +
    'box-shadow:0 0 0 1px #e1e9f0}' +
    'h1{font-size:22px;margin:0 0 16px}' +
    'p{margin:0 0 12px}' +
    '.muted{color:#36394a;font-size:14px}' +
    // Кнопка под палец: 48 точек в высоту, на телефоне во всю ширину.
    '.button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;' +
    'box-sizing:border-box;margin-top:12px;padding:0 20px;border-radius:8px;' +
    'background:#127ee3;color:#fff;text-decoration:none;font-weight:500}' +
    '@media (max-width:560px){.button{width:100%}}' +
    '</style></head><body><main>' +
    `<h1>${escapeHtml(title)}</h1>${body}` +
    '</main></body></html>'
  );
}
