import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLAN_FEATURES, type PlanFeature } from '@gramota/shared';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { PlansService } from './plans.service';
import { allows } from './plan';

export const PLAN_FEATURE_KEY = 'plan:feature';

/**
 * Возможность, без которой этот раздел не работает.
 *
 * Именно так, а не `if (plan === 'pro')` внутри службы: набор включённого
 * задаётся при назначении плана и меняется разговором, а не релизом.
 */
export const RequiresFeature = (feature: PlanFeature) => SetMetadata(PLAN_FEATURE_KEY, feature);

@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly plans: PlansService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(PLAN_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const orgId = req.currentUser?.orgId;
    // Без организации в запросе решать нечего: такие пути закрыты
    // другими сторожами, и подменять их этот не должен.
    if (!orgId) return true;

    const quota = await this.plans.quota(orgId);
    if (allows(quota, feature)) return true;

    throw new ForbiddenException(
      quota.expired
        ? `Срок плана «${quota.name}» закончился, поэтому раздел «${PLAN_FEATURES[feature]}» ` +
          `сейчас недоступен. Уже выданные документы остаются действительными. ` +
          `Напишите нам — обсудим продление.`
        : `«${PLAN_FEATURES[feature]}» не входит в ваш план. Напишите нам — добавим.`,
    );
  }
}
