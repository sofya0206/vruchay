import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      version: process.env.APP_VERSION ?? 'dev',
      time: new Date().toISOString(),
    };
  }
}
