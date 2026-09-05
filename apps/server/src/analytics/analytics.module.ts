import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { AnalyticsController } from './analytics.controller';
import { MetricsService } from './metrics.service';
import { FunnelService } from './funnel.service';
import { DigestService } from './digest.service';

/**
 * Метрики: цифры по своей организации, воронка активации по всем сразу
 * и месячная сводка письмом.
 *
 * Почту берёт у почтового модуля, а не заводит свою: сводка уходит тем же
 * служебным путём, что письмо с подтверждением адреса.
 */
@Module({
  imports: [MailModule],
  controllers: [AnalyticsController],
  providers: [MetricsService, FunnelService, DigestService],
  exports: [MetricsService],
})
export class AnalyticsModule {}
