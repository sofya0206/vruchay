import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { ExpiryNoticeService } from './expiry-notice.service';

/**
 * Срок действия документов: утреннее уведомление участников.
 *
 * Сам срок считается при выпуске (см. verify/expiry.ts) и читается
 * реестром и страницей проверки; здесь живёт только то, что требует
 * расписания и почты.
 */
@Module({ imports: [MailModule], providers: [ExpiryNoticeService] })
export class ExpiryModule {}
