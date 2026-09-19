import { Global, Module } from '@nestjs/common';
import { RecipientController } from './recipient.controller';
import { RecipientService } from './recipient.service';

/** Глобальный: ссылку на страницу получателя вставляет в письмо рассылка. */
@Global()
@Module({
  controllers: [RecipientController],
  providers: [RecipientService],
  exports: [RecipientService],
})
export class RecipientModule {}
