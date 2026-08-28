import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module';
import { MailModule } from '../mail/mail.module';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';
import { RegistryActionsService } from './registry-actions.service';
import { AnalyticsService } from './analytics.service';
import { ReplacementService } from './replacement.service';

/**
 * Реестр выданного, массовые действия над ним и аналитика.
 *
 * Очередь выпуска и почту берём готовыми: второй очереди и второго
 * почтового пути в системе быть не должно — иначе перевыпуск обходил бы
 * ограничения выпуска, а переотправка — проверки отправителя.
 *
 * ReplacementService отдаём наружу: связь «старый документ → новый» нужна
 * и странице проверки подлинности, которая живёт вне кабинета.
 */
@Module({
  imports: [GenerationModule, MailModule],
  controllers: [RegistryController],
  providers: [RegistryService, RegistryActionsService, AnalyticsService, ReplacementService],
  exports: [ReplacementService],
})
export class RegistryModule {}
