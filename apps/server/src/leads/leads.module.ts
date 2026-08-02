import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { LeadsController, LeadsPublicController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [MailModule, InvoicesModule],
  controllers: [LeadsController, LeadsPublicController],
  providers: [LeadsService],
})
export class LeadsModule {}
