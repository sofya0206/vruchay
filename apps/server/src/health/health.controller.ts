import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get()
  health() {
    return {
      status: 'ok',
      version: this.config.get('APP_VERSION', { infer: true }),
      time: new Date().toISOString(),
    };
  }
}
