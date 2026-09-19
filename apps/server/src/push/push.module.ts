import { Global, Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/**
 * Глобальный: уведомляют о конце работы и воркер выпуска, и рассылка —
 * тащить модуль в каждый из них отдельно незачем.
 */
@Global()
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
