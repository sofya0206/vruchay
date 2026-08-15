import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { MailModule } from '../mail/mail.module';
import { BackupWatchService } from './backup-watch.service';

@Module({
  imports: [StorageModule, MailModule],
  providers: [BackupWatchService],
  exports: [BackupWatchService],
})
export class BackupModule {}
