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
  /** Свой идентификатор письма: попадает в заголовки и возвращается в вебхуках. */
  reference?: string;
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
  reference: string;
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
