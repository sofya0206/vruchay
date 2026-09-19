import type { ConfigService } from '@nestjs/config';
import type { MailProvider } from './mail-provider.interface';
import { SmtpProvider } from './smtp.provider';
import { DashaMailProvider } from './dashamail.provider';
import type { Env } from '../config/env';

/**
 * Провайдер почты на весь процесс — по MAIL_PROVIDER.
 *
 * По умолчанию SMTP: локально он смотрит в Mailpit, и письмо из разработки
 * не может уйти настоящему человеку, даже если в базе лежат живые адреса.
 * DashaMail включается только явной настройкой боевого окружения.
 *
 * Выбор не по домену отправителя и не по письму: провайдер один, и письма,
 * поставленные в очередь до переключения, уходят через нового — старого
 * в процессе уже нет.
 */
export function createMailProvider(config: ConfigService<Env, true>): MailProvider {
  return config.get('MAIL_PROVIDER', { infer: true }) === 'dashamail'
    ? new DashaMailProvider(config)
    : new SmtpProvider(config);
}
