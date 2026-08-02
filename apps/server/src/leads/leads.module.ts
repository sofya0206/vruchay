import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { LeadsController, LeadsPublicController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [MailModule],
  controllers: [LeadsController, LeadsPublicController],
  providers: [LeadsService],
})
export class LeadsModule {}
