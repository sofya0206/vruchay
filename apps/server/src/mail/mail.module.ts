import { Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import { TrackingController } from './tracking.controller';
import { MailWebhookController } from './webhook.controller';
import { MailService } from './mail.service';
import { MailProcessor } from './mail.processor';
import { SmtpProvider } from './smtp.provider';

@Module({
  controllers: [MailController, TrackingController, MailWebhookController],
  providers: [MailService, MailProcessor, SmtpProvider],
  exports: [MailService, MailProcessor],
})
export class MailModule {}
