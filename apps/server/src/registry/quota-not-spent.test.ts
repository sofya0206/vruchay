import { describe, expect, it } from 'vitest';
import { RegistryActionsService } from './registry-actions.service';
import { PlansService } from '../plans/plans.service';
import { testConfig } from '../config/env.test-utils';
import { planRecord } from '../plans/plans.test-utils';
import type { PlanRecord } from '../plans/plan';

/*
 * Что квоту не тратит.
 *
 * Правило денежное и одно: списывается выпуск, то есть появление нового
 * файла. Скачивание, печать и переотправка уже выпущенного не стоят ничего
 * и никогда не должны упереться в исчерпанный план — человек с потерянным
 * письмом спустя месяц после мероприятия не виноват в том, что квота
 * кончилась, и документ у него уже есть.
 *
 * Проверяем это не по итоговой цифре, а по тому, спрашивал ли кто-нибудь
 * про квоту вообще: цифра сойдётся и в том случае, если проверка есть,
 * но случайно проходит.
 */

interface Counters {
  quotaAsked: number;
  filesCreated: number;
  enqueuedEmails: string[];
  downloadCounted: string[][];
}

function serviceWith(plans: PlanRecord[] = []): {
  service: RegistryActionsService;
  counters: Counters;
} {
  const counters: Counters = {
    quotaAsked: 0,
    filesCreated: 0,
    enqueuedEmails: [],
    downloadCounted: [],
  };

  const prisma = {
    organization: {
      findUnique: async () => {
        // Про организацию спрашивает только проверка квоты — по этому
        // и судим, была ли она.
        counters.quotaAsked++;
        return { id: 'org', plan: 'paid' };
      },
    },
    plan: { findMany: async () => plans },
    file: {
      findMany: async () => [
        {
          id: 'file-1',
          orgId: 'org',
          documentId: 'doc-1',
          rowId: 'row-1',
          mime: 'application/pdf',
          replacedById: null,
          replacedByJobId: null,
          row: { data: { name: 'Иванова Анна', email: 'anna@example.test' } },
          document: { deletedAt: null },
        },
      ],
      count: async () => 100_000,
      create: async () => {
        counters.filesCreated++;
        return { id: 'new-file' };
      },
      updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        counters.downloadCounted.push(where.id.in);
        return { count: where.id.in.length };
      },
    },
    email: { update: async () => ({ id: 'email-1' }) },
    // Перевыпуск идёт под замком на организацию и в своей транзакции.
    generationJob: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: { data: { documentId: string; total: number } }) => ({
        id: 'job-1',
        total: data.total,
        attempt: 1,
        documentId: data.documentId,
      }),
    },
    recipientRow: { updateMany: async () => ({ count: 1 }) },
    $executeRaw: async () => 0,
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(prisma),
  };

  const mail = { queueSingle: async () => 'email-1' };
  const mailProcessor = {
    enqueue: async (id: string) => {
      counters.enqueuedEmails.push(id);
    },
  };
  const plansService = new PlansService(
    prisma as never,
    { bonusDocuments: async () => 0 } as never,
    testConfig() as never,
  );

  const service = new RegistryActionsService(
    prisma as never,
    { settle: async () => new Map() } as never,
    plansService,
    { enqueue: async () => 1 } as never,
    mail as never,
    mailProcessor as never,
  );
  return { service, counters };
}

/** План, который кончился вчера: строже случая быть не может. */
const expiredPlan = [
  planRecord({
    documentLimit: 100,
    startsAt: new Date(Date.now() - 2 * 24 * 60 * 60_000),
    endsAt: new Date(Date.now() - 24 * 60 * 60_000),
  }),
];

describe('переотправка письма квоту не тратит', () => {
  it('ставит письмо в очередь и ни разу не спрашивает про квоту', async () => {
    const { service, counters } = serviceWith();

    const result = await service.resend('org', ['file-1']);

    expect(result.queued).toBe(1);
    expect(counters.filesCreated).toBe(0);
    expect(counters.quotaAsked).toBe(0);
  });

  it('работает и после того, как план кончился', async () => {
    // Письмо потерялось спустя месяц после мероприятия — самый частый
    // запрос в поддержку. Документ у человека уже есть, платить второй раз
    // за конверт не за что.
    const { service, counters } = serviceWith(expiredPlan);

    const result = await service.resend('org', ['file-1']);

    expect(result.queued).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(counters.filesCreated).toBe(0);
  });
});

describe('скачивание квоту не тратит', () => {
  it('счётчик скачиваний растёт, файлов не прибавляется, квота не спрашивается', async () => {
    const { service, counters } = serviceWith(expiredPlan);

    await service.countDownloads('org', ['file-1', 'file-2']);

    expect(counters.downloadCounted).toEqual([['file-1', 'file-2']]);
    expect(counters.filesCreated).toBe(0);
    expect(counters.quotaAsked).toBe(0);
  });
});

describe('перевыпуск — другое дело', () => {
  it('он создаёт новые документы, поэтому про квоту спрашивает', async () => {
    // Граница правила: всё, что порождает новый файл, считается.
    const { service, counters } = serviceWith(expiredPlan);

    await expect(service.reissue('org', ['file-1'])).resolves.toBeDefined();
    expect(counters.quotaAsked).toBeGreaterThan(0);
  });
});
