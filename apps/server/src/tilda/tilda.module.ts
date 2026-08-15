import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { GenerationModule } from '../generation/generation.module';
import { DocumentsModule } from '../documents/documents.module';
import { TildaController } from './tilda.controller';
import { TildaPublicController } from './tilda-public.controller';
import { TildaService } from './tilda.service';
import { TildaProcessor } from './tilda.processor';
import { OtpService } from './otp.service';
import { RetentionService } from './retention.service';

@Module({
  // DocumentsModule — ради ночной очистки корзины: сроки хранения
  // собраны в одном задании, а удаление документа умеет только его служба.
  imports: [MailModule, GenerationModule, DocumentsModule],
  controllers: [TildaController, TildaPublicController],
  providers: [TildaService, TildaProcessor, OtpService, RetentionService],
  exports: [TildaService],
})
export class TildaModule {}
