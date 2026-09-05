import { Global, Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlanFeatureGuard } from './plan-feature.guard';

/**
 * Глобальный: остаток по плану спрашивают выпуск, перевыпуск, главная
 * кабинета и сторож возможностей. Второй службы с этим знанием быть
 * не должно — расхождение в остатке стоит доверия.
 */
@Global()
@Module({
  providers: [PlansService, PlanFeatureGuard],
  exports: [PlansService, PlanFeatureGuard],
})
export class PlansModule {}
