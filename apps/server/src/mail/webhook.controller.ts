import { Body, Controller, Logger, NotFoundException, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { MailService } from './mail.service';
import { parseMailWebhook } from './webhook-events';
import type { Env } from '../config/env';

/**
 * Уведомления почтового провайдера о судьбе писем.
 *
 * Ради чего: без них состояние «доставлено» недостижимо. SMTP сообщает
 * только о том, что письмо принято шлюзом; дошло ли оно до ящика, знает
 * провайдер. До этого недоставленное письмо выглядело в реестре как
 * отправленное, и на жалобу «мне ничего не пришло» ответить было нечем.
 *
 * Проверка своего — по секрету в адресе. Не самый изящный способ, но
 * единственный, который работает у любого провайдера: настраиваемая
 * подпись есть не у всех, а задать адрес обратного вызова даёт каждый.
 * Секрет сравнивается за постоянное время: адрес попадает в чужие журналы
 * и настройки, и подбирать его по времени ответа не должно быть можно.
 *
 * Отвечаем 200 почти всегда — и на непонятное тело тоже. Провайдер на
 * ошибку начинает повторять доставку, и разбираться, почему у нас не
 * разобралось одно событие из ста, он будет повторами всех ста.
 */
@Controller('v1/mail/webhook')
export class MailWebhookController {
  private readonly logger = new Logger(MailWebhookController.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Тип события — отдельным куском адреса.
   *
   * Так устроен кабинет DashaMail: там не один адрес на все события,
   * а отдельное поле на каждое — «Доставка», «Возвраты», «Жалоба
   * на спам». В теле тип при этом не приходит вовсе, он определяется
   * тем, куда постучались.
   *
   * Незнакомое слово в адресе не ошибка: у провайдера событий больше,
   * чем нам нужно (клики, отписки), и на них мы просто отвечаем «принято»
   * и ничего не делаем.
   */
  private static readonly PATH_TYPES: Record<string, 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed'> = {
    sent: 'sent',
    delivered: 'delivered',
    opened: 'opened',
    bounced: 'bounced',
    failed: 'failed',
  };

  @Post(':secret/:event')
  async receiveTyped(
    @Param('secret') secret: string,
    @Param('event') event: string,
    @Body() body: unknown,
  ) {
    return this.handle(secret, body, MailWebhookController.PATH_TYPES[event.toLowerCase()]);
  }

  @Post(':secret')
  async receive(@Param('secret') secret: string, @Body() body: unknown) {
    return this.handle(secret, body, undefined);
  }

  private async handle(
    secret: string,
    body: unknown,
    defaultType: 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed' | undefined,
  ) {
    const expected = this.config.get('MAIL_WEBHOOK_SECRET', { infer: true });

    // Пустой секрет означает «приём выключен». Принимать что угодно,
    // пока настройка не задана, нельзя: это открытая ручка, меняющая
    // состояния писем.
    if (!expected || !sameSecret(secret, expected)) {
      // 404, а не 403: посторонний не должен узнать, что здесь вообще
      // что-то есть.
      throw new NotFoundException();
    }

    const events = parseMailWebhook(body, defaultType);
    if (events.length === 0) {
      // Не молчим: пустой разбор при непустом теле — первый признак того,
      // что провайдер присылает поля не под теми именами, которых мы ждём.
      //
      // Пишем **имена** полей, а не значения: по именам видно, что чинить,
      // а в значениях лежат адреса участников — то есть персональные данные,
      // которым в журнале сервера делать нечего. Без этой строки первая же
      // настройка у нового провайдера превращалась бы в гадание.
      this.logger.warn(
        `Уведомление не дало ни одного понятного события. Поля: ${fieldNames(body).join(', ') || '—'}`,
      );
      return { ok: true, applied: 0 };
    }

    const applied = await this.mail.applyProviderEvents(events);
    this.logger.log(`Уведомление: событий ${events.length}, применено ${applied}`);
    return { ok: true, applied };
  }
}

/**
 * Имена полей уведомления — чтобы было по чему чинить сопоставление.
 *
 * Заглядываем на один уровень внутрь: провайдеры кладут события
 * и в корень, и в массив, и в поле вроде `events`.
 */
function fieldNames(body: unknown): string[] {
  const names = new Set<string>();

  const collect = (value: unknown, depth: number) => {
    if (depth > 2 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      // Хватит первого элемента: остальные той же формы.
      collect(value[0], depth);
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      names.add(key);
      collect(nested, depth + 1);
    }
  };

  collect(body, 0);
  return [...names].slice(0, 40);
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Разная длина — сразу нет, но сравнение всё равно постоянного времени
  // по длине эталона, чтобы не подсказывать её.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
