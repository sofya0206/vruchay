import { Global, Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';

/** Общие для всех модулей службы: счётчики частоты и то, что появится дальше. */
@Global()
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class CommonModule {}
