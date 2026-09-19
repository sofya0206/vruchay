import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailController } from './mail.controller';
import { TrackingController } from './tracking.controller';
import { MailWebhookController } from './webhook.controller';
import { MailService } from './mail.service';
import { MailProcessor } from './mail.processor';
import { MAIL_PROVIDER } from './mail-provider.interface';
import { createMailProvider } from './mail-provider.factory';

@Module({
  controllers: [MailController, TrackingController, MailWebhookController],
  providers: [
    MailService,
    MailProcessor,
    { provide: MAIL_PROVIDER, inject: [ConfigService], useFactory: createMailProvider },
  ],
  exports: [MailService, MailProcessor],
})
export class MailModule {}
