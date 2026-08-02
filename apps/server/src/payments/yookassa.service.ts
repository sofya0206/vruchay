import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/**
 * Платежи через ЮKassa.
 *
 * Ключевое про их уведомления: они **не подписаны**. Поэтому тело входящего
 * запроса здесь считается только подсказкой «посмотри платёж такой-то»,
 * а состояние платежа берётся отдельным запросом к их API. Иначе включить
 * оплаченный тариф мог бы любой, кто узнал адрес обработчика.
 *
 * Подключение сводится к двум значениям в окружении — YOOKASSA_SHOP_ID
 * и YOOKASSA_SECRET_KEY. Пока их нет, служба сообщает, что не настроена,
 * и не роняет приложение: остальной сервис от платежей не зависит.
 */

const API = 'https://api.yookassa.ru/v3';

export interface CreatedPayment {
  id: string;
  confirmationUrl: string;
}

interface YookassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount?: { value: string; currency: string };
  confirmation?: { confirmation_url?: string };
  metadata?: Record<string, string>;
}

@Injectable()
export class YookassaService {
  private readonly logger = new Logger(YookassaService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get configured(): boolean {
    return Boolean(
      this.config.get('YOOKASSA_SHOP_ID', { infer: true }) &&
        this.config.get('YOOKASSA_SECRET_KEY', { infer: true }),
    );
  }

  private authHeader(): string {
    const id = this.config.get('YOOKASSA_SHOP_ID', { infer: true });
    const key = this.config.get('YOOKASSA_SECRET_KEY', { infer: true });
    return `Basic ${Buffer.from(`${id}:${key}`).toString('base64')}`;
  }

  /**
   * Создание платежа. Ключ идемпотентности обязателен: без него повторный
   * запрос при обрыве связи создаст второй платёж, и человек заплатит дважды.
   */
  async createPayment(params: {
    amountKopecks: number;
    description: string;
    returnUrl: string;
    email: string;
    metadata?: Record<string, string>;
  }): Promise<CreatedPayment> {
    if (!this.configured) throw new Error('ЮKassa не настроена: нет ключей в окружении');

    const body = {
      amount: {
        value: (params.amountKopecks / 100).toFixed(2),
        currency: 'RUB',
      },
      capture: true,
      confirmation: { type: 'redirect', return_url: params.returnUrl },
      description: params.description.slice(0, 128),
      metadata: params.metadata,
      receipt: {
        customer: { email: params.email },
        items: [
          {
            description: params.description.slice(0, 128),
            quantity: '1.00',
            amount: { value: (params.amountKopecks / 100).toFixed(2), currency: 'RUB' },
            vat_code: 1, // без НДС: упрощённая система налогообложения
            payment_mode: 'full_prepayment',
            payment_subject: 'service',
          },
        ],
      },
    };

    const res = await fetch(`${API}/payments`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Idempotence-Key': randomUUID(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ЮKassa отказала: ${res.status} ${text.slice(0, 200)}`);
    }

    const payment = (await res.json()) as YookassaPayment;
    const url = payment.confirmation?.confirmation_url;
    if (!url) throw new Error('ЮKassa не вернула ссылку на оплату');
    return { id: payment.id, confirmationUrl: url };
  }

  /**
   * Состояние платежа по его идентификатору.
   *
   * Именно этим проверяется уведомление: телу запроса верить нельзя,
   * а этому ответу — можно, он получен по нашему ключу с их адреса.
   */
  async getPayment(id: string): Promise<YookassaPayment | null> {
    if (!this.configured) return null;
    const res = await fetch(`${API}/payments/${encodeURIComponent(id)}`, {
      headers: { Authorization: this.authHeader() },
    });
    if (!res.ok) {
      this.logger.warn(`Не удалось получить платёж ${id}: ${res.status}`);
      return null;
    }
    return (await res.json()) as YookassaPayment;
  }
}
