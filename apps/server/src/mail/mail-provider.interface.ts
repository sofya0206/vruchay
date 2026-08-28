import type { Readable } from 'node:stream';

/**
 * Абстракция почтового провайдера.
 *
 * Она обязательна, а не желательна: провайдер придётся менять. DashaMail может
 * не потянуть объём, для белорусского контура понадобится другой, а зарубежные
 * (Mailgun, Amazon SES, Postmark) для наших юрлиц недоступны в принципе.
 * Локально письма уходят в Mailpit по тому же интерфейсу.
 */

export interface MailAttachment {
  filename: string;
  content: Buffer | Readable;
  contentType: string;
}

export interface OutgoingMessage {
  from: { email: string; name: string };
  to: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
  /**
   * Куда придёт ответ, если он отличается от отправителя.
   *
   * Нужен, когда письмо уходит с нашего домена от имени организации:
   * в отправителе стоит адрес на vruchay.ru, чтобы сходились SPF и DKIM,
   * а отвечать участник должен организации, а не нам.
   */
  replyTo?: string;
  /** Свой идентификатор письма: попадает в заголовки и возвращается в вебхуках. */
  reference?: string;
  /**
   * Ссылка отписки для заголовка `List-Unsubscribe` — только у рекламных писем.
   *
   * Почтовые службы показывают по нему свою кнопку «Отписаться», а рассылку
   * без него считают менее добросовестной и охотнее уводят в спам. Ссылка
   * та же, что в подвале письма: два разных адреса отписки разошлись бы.
   */
  listUnsubscribeUrl?: string;
}

export interface DnsRecord {
  type: 'TXT' | 'CNAME' | 'MX';
  host: string;
  value: string;
  /** Человеческое пояснение: что это за запись и зачем она нужна. */
  purpose: string;
}

export type DomainStatus = 'pending' | 'verified' | 'failed';

export interface NormalizedEvent {
  /** Наш идентификатор письма, если провайдер его вернул. Иначе пусто. */
  reference: string;
  /**
   * Идентификатор письма у провайдера и адрес получателя — запасные
   * способы найти письмо, когда своя ссылка не вернулась. Мы кладём её
   * в заголовок отправляемого письма, а вернёт ли провайдер чужой
   * заголовок в уведомлении — его дело, не наше.
   */
  providerMessageId?: string;
  email?: string;
  type: 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed';
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface MailProvider {
  readonly name: string;

  send(message: OutgoingMessage): Promise<{ providerMessageId: string }>;

  /**
   * Какие DNS-записи должен прописать владелец домена.
   *
   * verificationToken уникален для каждой заявки: без него записи были бы
   * одинаковыми для всех организаций, и любой клиент «подтвердил» бы чужой
   * домен, просто повторив общий SPF. Прописать уникальную запись может
   * только тот, у кого есть доступ к зоне DNS.
   */
  getDomainSetup(domain: string, verificationToken: string): Promise<DnsRecord[]>;

  /** Проверка, что записи реально видны в DNS. */
  checkDomain(domain: string, records: DnsRecord[]): Promise<DomainStatus>;

  /** Разбор вебхука провайдера в наши события. Пустой массив — событие неинтересно. */
  parseWebhook(body: unknown, headers: Record<string, string | undefined>): NormalizedEvent[];
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
