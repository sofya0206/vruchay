import { describe, expect, it } from 'vitest';
import { PLAN_FEATURE_KEYS } from '@gramota/shared';
import { assignPlanSchema } from './platform.controller';
import { PlansService } from '../plans/plans.service';
import { testConfig } from '../config/env.test-utils';

/*
 * Назначение плана вручную.
 *
 * Самообслуживания и оплаты картой здесь нет вовсе: цена обсуждается лично,
 * и план заводит тот, кто её обсуждал. Значит, единственная защита от плана
 * с отрицательным лимитом или с возможностью, которой в коде нет, — проверка
 * на границе. Разбираться в таком плане пришлось бы посреди чужого
 * награждения.
 */

const valid = {
  name: '500 документов на год',
  documentLimit: 500,
  period: 'year',
  startsAt: '2026-09-01',
  endsAt: '2027-09-01',
};

describe('что принимается в назначении плана', () => {
  it('разумные условия проходят', () => {
    const parsed = assignPlanSchema.parse(valid);
    expect(parsed.documentLimit).toBe(500);
    expect(parsed.startsAt).toBeInstanceOf(Date);
  });

  it('по умолчанию в план входит всё', () => {
    // Ограничение — решение переговоров, и принимать его должен человек,
    // а не забытое поле в запросе.
    expect(assignPlanSchema.parse(valid).features).toEqual(PLAN_FEATURE_KEYS);
  });

  it('лимит меньше единицы не принимается', () => {
    // И отказ по-русски: этот ответ читает человек, а не разработчик.
    expect(() => assignPlanSchema.parse({ ...valid, documentLimit: 0 })).toThrow(/больше нуля/);
    expect(() => assignPlanSchema.parse({ ...valid, documentLimit: -5 })).toThrow(/больше нуля/);
  });

  it('дробный лимит не принимается: документ выпускается целиком', () => {
    expect(() => assignPlanSchema.parse({ ...valid, documentLimit: 1.5 })).toThrow(/целиком/);
  });

  it('незнакомая возможность не принимается', () => {
    expect(() => assignPlanSchema.parse({ ...valid, features: ['телепатия'] })).toThrow(
      /Возможности плана/,
    );
  });

  it('незнакомый период не принимается', () => {
    expect(() => assignPlanSchema.parse({ ...valid, period: 'пожизненно' })).toThrow(/Период/);
  });

  it('окончание раньше начала не принимается', () => {
    expect(() =>
      assignPlanSchema.parse({ ...valid, startsAt: '2027-01-01', endsAt: '2026-01-01' }),
    ).toThrow(/раньше его начала/);
  });

  it('план без срока — обычное дело: разовый пакет', () => {
    const parsed = assignPlanSchema.parse({
      name: 'Пакет 200',
      documentLimit: 200,
      period: 'package',
      neverExpires: true,
    });
    expect(parsed.endsAt).toBeUndefined();
    expect(parsed.neverExpires).toBe(true);
  });

  it('план без названия не принимается: он же нужен в разговоре', () => {
    expect(() => assignPlanSchema.parse({ ...valid, name: ' ' })).toThrow();
  });
});

describe('план заводится записью, а не правкой кода', () => {
  it('сохраняет условия и отмечает, кто назначил', async () => {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      organization: { findUnique: async () => ({ id: 'org', name: 'Школа' }) },
      plan: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'plan-1', ...data };
        },
        findMany: async () => [],
      },
      file: { count: async () => 0 },
    };
    const plans = new PlansService(
      prisma as never,
      { bonusDocuments: async () => 0 } as never,
      testConfig() as never,
    );

    await plans.assign(
      'org',
      {
        name: 'Пакет 500',
        documentLimit: 500,
        period: 'package',
        startsAt: new Date('2026-09-01'),
        endsAt: null,
        features: ['mailing'],
        neverExpires: true,
        note: 'Договорились на звонке',
      },
      'sofia@vruchay.ru',
    );

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      orgId: 'org',
      name: 'Пакет 500',
      documentLimit: 500,
      period: 'package',
      features: ['mailing'],
      neverExpires: true,
      assignedBy: 'sofia@vruchay.ru',
    });
  });

  it('несуществующей организации план не назначить', async () => {
    const prisma = {
      organization: { findUnique: async () => null },
      plan: { create: async () => ({}) },
      file: { count: async () => 0 },
    };
    const plans = new PlansService(
      prisma as never,
      { bonusDocuments: async () => 0 } as never,
      testConfig() as never,
    );

    await expect(
      plans.assign('нет-такой', {
        name: 'Пакет',
        documentLimit: 10,
        period: 'package',
        startsAt: new Date(),
        endsAt: null,
        features: [],
        neverExpires: false,
      }),
    ).rejects.toThrow(/не найдена/);
  });
});
