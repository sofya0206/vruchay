import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { PlanFeature } from '@gramota/shared';
import { PlanFeatureGuard } from './plan-feature.guard';
import { fakePlans, planRecord } from './plans.test-utils';
import type { PlanRecord } from './plan';

/*
 * Возможности спрашиваются у плана.
 *
 * Смысл сторожа не в том, чтобы что-то запретить, а в том, чтобы набор
 * включённого задавался при назначении плана и менялся разговором.
 * `if (plan === 'pro')` внутри службы означал бы релиз на каждого клиента
 * с особыми условиями.
 */

function contextFor(orgId: string | undefined) {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({
      getRequest: () => (orgId ? { currentUser: { orgId, role: 'owner' } } : {}),
    }),
  } as never;
}

function guardFor(
  required: PlanFeature | undefined,
  stub: { plan?: 'free' | 'paid'; plans?: PlanRecord[] },
): PlanFeatureGuard {
  const reflector = { getAllAndOverride: () => required } as never;
  return new PlanFeatureGuard(reflector, fakePlans({ used: 0, ...stub }));
}

describe('сторож возможностей', () => {
  it('пропускает то, что входит в план', async () => {
    const guard = guardFor('mailing', {
      plan: 'paid',
      plans: [planRecord({ features: ['mailing'] })],
    });

    await expect(guard.canActivate(contextFor('org'))).resolves.toBe(true);
  });

  it('не пропускает то, что в план не входит, и говорит, что делать', async () => {
    const guard = guardFor('api', { plan: 'paid', plans: [planRecord({ features: ['mailing'] })] });

    await expect(guard.canActivate(contextFor('org'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(contextFor('org'))).rejects.toThrow(/Напишите нам/);
  });

  it('на бесплатной пробе не отнимает ничего', async () => {
    // Проба — это вход в продукт: урезать её значило бы не дать человеку
    // увидеть то, за что мы потом просим денег.
    const guard = guardFor('api', { plan: 'free' });

    await expect(guard.canActivate(contextFor('org'))).resolves.toBe(true);
  });

  it('после окончания срока плана закрывает и объясняет почему', async () => {
    const guard = guardFor('mailing', {
      plan: 'paid',
      plans: [
        planRecord({
          startsAt: new Date('2025-01-01'),
          endsAt: new Date('2025-06-01'),
          features: ['mailing'],
        }),
      ],
    });

    await expect(guard.canActivate(contextFor('org'))).rejects.toThrow(/Срок плана/);
    // И тут же обещает, что выданное осталось выданным.
    await expect(guard.canActivate(contextFor('org'))).rejects.toThrow(/остаются действительными/);
  });

  it('на маршруте без требования возможности не мешает', async () => {
    const guard = guardFor(undefined, { plan: 'paid', plans: [planRecord({ features: [] })] });

    await expect(guard.canActivate(contextFor('org'))).resolves.toBe(true);
  });

  it('без организации в запросе решать нечего — такие пути закрыты не им', async () => {
    const guard = guardFor('api', { plan: 'paid', plans: [planRecord({ features: [] })] });

    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
  });
});
