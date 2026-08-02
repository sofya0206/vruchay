import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { YookassaService } from './yookassa.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, YookassaService],
  exports: [PaymentsService, YookassaService],
})
export class PaymentsModule {}
