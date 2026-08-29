import { describe, expect, it } from 'vitest';
import { VerifyController } from './verify.controller';
import { PlansService } from '../plans/plans.service';
import { testConfig } from '../config/env.test-utils';
import { planRecord } from '../plans/plans.test-utils';

/*
 * Жизнь документов после окончания плана.
 *
 * Это первый вопрос на переговорах: «а что будет с уже выданными грамотами,
 * когда договор кончится?» Ответ — ничего: они остаются действительными,
 * и страница проверки по QR-коду продолжает работать. Документ на руках
 * у участника не может протухнуть от того, что у организации кончился
 * договор с нами.
 *
 * Проверка подлинности открыта без входа: её открывает посторонний человек,
 * у которого нет и не должно быть учётной записи. Спрашивать у него про
 * чужой тариф тем более не о чем — и этот тест держит проверку такой.
 */

/** План, который кончился вчера. */
const expiredPlan = planRecord({
  documentLimit: 100,
  startsAt: new Date(Date.now() - 2 * 24 * 60 * 60_000),
  endsAt: new Date(Date.now() - 24 * 60 * 60_000),
});

function controllerWith(): {
  controller: VerifyController;
  asked: { organization: number; counted: number };
  plans: PlansService;
} {
  const asked = { organization: 0, counted: 0 };

  const prisma = {
    organization: {
      findUnique: async () => {
        asked.organization++;
        return { id: 'org', plan: 'paid' };
      },
    },
    plan: { findMany: async () => [expiredPlan] },
    file: {
      findUnique: async () => ({
        id: 'file-1',
        orgId: 'org',
        createdAt: new Date('2026-05-01T10:00:00Z'),
        verifyRevoked: false,
        rowId: 'row-1',
        replacedById: null,
        replacedByJobId: null,
        document: { title: 'Диплом', verifyEnabled: true, verifyFields: ['name'] },
        row: { data: { name: 'Иванова Анна', email: 'anna@example.test' } },
        rows: [{ data: { name: 'Иванова Анна', email: 'anna@example.test' } }],
      }),
      count: async () => 100,
      update: async () => {
        asked.counted++;
        return { id: 'file-1' };
      },
    },
  };

  const plans = new PlansService(
    prisma as never,
    { bonusDocuments: async () => 0 } as never,
    testConfig() as never,
  );
  const controller = new VerifyController(prisma as never, {
    settleOne: async () => null,
  } as never);
  return { controller, asked, plans };
}

describe('проверка по QR после окончания плана', () => {
  it('документ по-прежнему подтверждается', async () => {
    const { controller } = controllerWith();

    const answer = await controller.check('11111111-1111-1111-1111-111111111111');

    expect(answer.valid).toBe(true);
    expect(answer.title).toBe('Диплом');
  });

  it('показывает ровно то, что организация отметила показываемым', async () => {
    // Окончание плана не повод раскрыть больше обычного — и не повод
    // раскрыть меньше: почта в разрешённые поля не входит и не показывается.
    const { controller } = controllerWith();

    const answer = await controller.check('11111111-1111-1111-1111-111111111111');

    expect(answer.fields).toEqual({ name: 'Иванова Анна' });
  });

  it('про тариф выдавшей организации не спрашивает вовсе', async () => {
    // Подлинность выданного документа не зависит от наших с ней расчётов.
    const { controller, asked } = controllerWith();

    await controller.check('11111111-1111-1111-1111-111111111111');

    expect(asked.organization).toBe(0);
    // А обезличенный счётчик проверок при этом растёт: организации он нужен
    // как раз для разговора о продлении.
    expect(asked.counted).toBe(1);
  });

  it('и всё это при том, что план действительно кончился', async () => {
    // Иначе тест доказывал бы работоспособность живого плана,
    // а не пережившего собственный срок.
    const { plans } = controllerWith();

    const quota = await plans.quota('org');

    expect(quota.expired).toBe(true);
    expect(quota.warn).toBe('expired');
  });
});
