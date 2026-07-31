import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { checkRecords } from './dns-check';
import type {
  DnsRecord,
  DomainStatus,
  MailProvider,
  NormalizedEvent,
  OutgoingMessage,
} from './mail-provider.interface';
import type { Env } from '../config/env';

/**
 * Отправка по SMTP.
 *
 * Работает и как локальный вариант (письма перехватывает Mailpit, ничего
 * не уходит наружу), и как боевой запасной: тем же классом подключается
 * SendPulse, Unisender Go или любой другой SMTP-шлюз, если основной провайдер
 * окажется недоступен.
 *
 * Ограничение, о котором надо помнить: по SMTP не приходят события доставки
 * и открытий. Письмо считается отправленным, дальнейшая судьба неизвестна.
 * Поэтому для боевой работы нужен провайдер с вебхуками.
 */
@Injectable()
export class SmtpProvider implements MailProvider {
  readonly name = 'smtp';
  private readonly logger = new Logger(SmtpProvider.name);
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService<Env, true>) {}

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const secure = this.config.get('SMTP_SECURE', { infer: true });
    const user = this.config.get('SMTP_USER', { infer: true });
    const pass = this.config.get('SMTP_PASSWORD', { infer: true });

    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure,
      // Локальный Mailpit работает без авторизации, боевой шлюз — с ней.
      auth: user ? { user, pass } : undefined,
    });
    return this.transporter;
  }

  async send(message: OutgoingMessage): Promise<{ providerMessageId: string }> {
    const info = await this.getTransporter().sendMail({
      from: { name: message.from.name, address: message.from.email },
      to: message.to,
      subject: message.subject,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
      headers: message.reference ? { 'X-Laureat-Ref': message.reference } : undefined,
    });
    return { providerMessageId: String(info.messageId) };
  }

  /**
   * Записи для собственного SMTP-шлюза. У провайдера с API этот список
   * приходит от него самого и включает ещё и DKIM с его ключом.
   */
  getDomainSetup(domain: string, verificationToken: string): Promise<DnsRecord[]> {
    return Promise.resolve([
      {
        // Уникальная запись — единственное доказательство владения доменом.
        // Записи SPF и DMARC одинаковы у всех клиентов и подтверждением быть не могут.
        type: 'TXT',
        host: '_laureat-verify',
        value: `laureat-verify=${verificationToken}`,
        purpose: 'Подтверждение владения доменом. Уникальна для вашей организации',
      },
      {
        type: 'TXT',
        host: '@',
        value: `v=spf1 include:${this.config.get('SMTP_SPF_INCLUDE', { infer: true })} ~all`,
        purpose: 'SPF: разрешает нашему серверу отправлять письма от вашего домена',
      },
      {
        type: 'TXT',
        host: '_dmarc',
        value: 'v=DMARC1; p=none; rua=mailto:postmaster@' + domain,
        purpose: 'DMARC: политика для писем, не прошедших проверку. Начинаем с p=none',
      },
    ]);
  }

  checkDomain(domain: string, records: DnsRecord[]): Promise<DomainStatus> {
    return checkRecords(domain, records);
  }

  parseWebhook(): NormalizedEvent[] {
    // SMTP не сообщает о доставке: события приходят только от провайдеров с API.
    return [];
  }
}
