import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { MailingController } from './mailing.controller';
import { UnsubscribeController } from './unsubscribe.controller';
import { MailingService } from './mailing.service';
import { TextMailingService } from './text-mailing.service';
import { MailStatsService } from './mail-stats.service';

/**
 * Раздел «Рассылка».
 *
 * Опирается на почтовый модуль, а не заводит свою отправку: письма уходят
 * той же очередью, тем же провайдером и с тем же ограничением частоты.
 */
@Module({
  imports: [MailModule],
  controllers: [MailingController, UnsubscribeController],
  providers: [MailingService, TextMailingService, MailStatsService],
})
export class MailingModule {}
