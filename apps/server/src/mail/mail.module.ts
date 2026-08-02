import { Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { MailProcessor } from './mail.processor';
import { SmtpProvider } from './smtp.provider';

@Module({
  controllers: [MailController],
  providers: [MailService, MailProcessor, SmtpProvider],
  exports: [MailService, MailProcessor],
})
export class MailModule {}
