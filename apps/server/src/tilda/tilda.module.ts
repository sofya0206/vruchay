import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { GenerationModule } from '../generation/generation.module';
import { TildaController } from './tilda.controller';
import { TildaPublicController } from './tilda-public.controller';
import { TildaService } from './tilda.service';
import { TildaProcessor } from './tilda.processor';
import { OtpService } from './otp.service';

@Module({
  imports: [MailModule, GenerationModule],
  controllers: [TildaController, TildaPublicController],
  providers: [TildaService, TildaProcessor, OtpService],
  exports: [TildaService],
})
export class TildaModule {}
