import { PlansService } from './plans.service';
import { testConfig } from '../config/env.test-utils';
import type { PlanRecord } from './plan';

/**
 * Стенд для проверок квоты.
 *
 * Живая база здесь не годится: правила про деньги должны проверяться
 * на каждый прогон тестов, а не раз в релиз вручную. Нужны от базы ровно
 * три запроса — организация, планы и число выпущенных файлов.
 */
export interface PlansStub {
  /** Старая колонка тарифа: до появления планов только она и была. */
  plan?: 'free' | 'paid';
  /** Сколько документов выпущено. Функция — если ответ зависит от условия. */
  used?: number | ((where: Record<string, unknown>) => number);
  /** Документы, заработанные приглашениями. */
  bonus?: number;
  /** Назначенные планы, от свежего к старому. */
  plans?: PlanRecord[];
  /** Предел бесплатной пробы, если он важен для проверки. */
  freeLimit?: number;
  /** Организации нет вовсе. */
  missing?: boolean;
}

/** Клиент базы в объёме, которого хватает PlansService. */
export function plansPrisma(stub: PlansStub = {}) {
  return {
    organization: {
      findUnique: async () => (stub.missing ? null : { id: 'org', plan: stub.plan ?? 'free' }),
    },
    plan: { findMany: async () => stub.plans ?? [] },
    file: {
      count: async ({ where }: { where: Record<string, unknown> }) =>
        typeof stub.used === 'function' ? stub.used(where) : (stub.used ?? 0),
    },
  };
}

export function fakePlans(stub: PlansStub = {}): PlansService {
  return new PlansService(
    plansPrisma(stub) as never,
    { bonusDocuments: async () => stub.bonus ?? 0 } as never,
    testConfig(
      stub.freeLimit === undefined ? {} : { FREE_DOCUMENT_LIMIT: String(stub.freeLimit) },
    ) as never,
  );
}

/** План с разумными значениями по умолчанию — переопределяем только нужное. */
export function planRecord(over: Partial<PlanRecord> = {}): PlanRecord {
  return {
    id: 'plan-1',
    name: '500 документов на год',
    documentLimit: 500,
    period: 'year',
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2027-01-01T00:00:00Z'),
    features: ['mailing', 'tilda', 'api', 'awards'],
    neverExpires: false,
    ...over,
  };
}
