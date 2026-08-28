import { describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AwardsService } from './awards.service';
import { createRuleSetSchema } from './awards.dto';

/*
 * Проверяем то, за что отвечает именно сервер, а не движок: скоуп
 * организации и принадлежность шаблонов. Раскладка покрыта тестами
 * движка в @gramota/shared, дублировать её здесь незачем.
 *
 * Prisma подменяем заглушкой: настоящих запросов нужно ровно два —
 * документ и список шаблонов.
 */

const OWN_TEMPLATE = '11111111-1111-4111-8111-111111111111';
const FOREIGN_TEMPLATE = '22222222-2222-4222-8222-222222222222';
const DOCUMENT = '33333333-3333-4333-8333-333333333333';
const RULE = '44444444-4444-4444-8444-444444444444';

interface Stub {
  /** Документы, которые видит организация из сессии. */
  visibleDocuments?: { id: string; title: string; ruleSetId?: string | null }[];
  rows?: { id: string; position: number; data: Record<string, string> }[];
  columns?: string[];
  /** Сколько строк отмечено на самом деле — больше, чем влезло в выборку. */
  totalRows?: number;
}

function serviceWith(stub: Stub = {}): AwardsService {
  const documents = stub.visibleDocuments ?? [
    { id: DOCUMENT, title: 'Первенство области', ruleSetId: null },
    { id: OWN_TEMPLATE, title: 'Диплом победителя', ruleSetId: null },
  ];
  const columns = (stub.columns ?? ['name', 'place', 'category']).map((name, position) => ({
    name,
    position,
  }));

  const prisma = {
    document: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        documents.find((d) => d.id === where.id) ?? null,
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        documents.filter((d) => where.id.in.includes(d.id)),
    },
    recipientRow: {
      findMany: async () => stub.rows ?? [],
      count: async () => stub.totalRows ?? (stub.rows ?? []).length,
    },
    recipientColumn: { findMany: async () => columns },
    awardRuleSet: { findFirst: async () => null },
  };
  return new AwardsService(prisma as never);
}

function draft(templateId: string) {
  return createRuleSetSchema.parse({
    name: 'Набор',
    groupColumn: 'category',
    statusColumn: '',
    rules: [
      {
        id: RULE,
        label: 'Победители',
        conditions: [{ field: 'place', op: 'placeEquals', value: 1 }],
        outputs: [{ templateDocumentId: templateId }],
      },
    ],
  });
}

describe('скоуп организации', () => {
  it('чужой документ отдаёт как ненайденный, а не как запрещённый', async () => {
    const svc = serviceWith({ visibleDocuments: [] });
    await expect(svc.preview('org', DOCUMENT)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('не даёт сослаться на чужой документ как на шаблон', async () => {
    const svc = serviceWith();
    await expect(svc.preview('org', DOCUMENT, draft(FOREIGN_TEMPLATE))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('свой шаблон принимает', async () => {
    const svc = serviceWith({
      rows: [{ id: 'row-1', position: 0, data: { name: 'Иванов', place: '1', category: 'Юноши' } }],
    });
    const { plan } = await svc.preview('org', DOCUMENT, draft(OWN_TEMPLATE));
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].templateTitle).toBe('Диплом победителя');
  });

  it('без привязанного набора объясняет, что делать, а не падает', async () => {
    const svc = serviceWith();
    await expect(svc.preview('org', DOCUMENT)).rejects.toThrow(/набор правил/i);
  });
});

describe('превью раскладки', () => {
  it('строка без правила попадает в отчёт с именем и номером', async () => {
    const svc = serviceWith({
      rows: [
        { id: 'row-1', position: 0, data: { name: 'Иванов', place: '1', category: 'Юноши' } },
        { id: 'row-2', position: 1, data: { name: 'Петров', place: '9', category: 'Юноши' } },
      ],
    });
    const { plan } = await svc.preview('org', DOCUMENT, draft(OWN_TEMPLATE));

    const unmatched = plan.issues.filter((i) => i.code === 'no-rule');
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]).toMatchObject({ rowNumber: 2, subject: 'Петров', severity: 'error' });
  });

  it('берёт первую колонку под ФИО, когда колонки «name» нет', async () => {
    const svc = serviceWith({
      columns: ['fio', 'place', 'category'],
      rows: [{ id: 'row-1', position: 0, data: { fio: 'Иванов', place: '9', category: 'Юноши' } }],
    });
    const { plan } = await svc.preview('org', DOCUMENT, draft(OWN_TEMPLATE));
    expect(plan.issues[0].subject).toBe('Иванов');
  });

  it('сообщает о недоделанном наборе отдельно от замечаний по строкам', async () => {
    const withoutTemplate = createRuleSetSchema.parse({
      name: 'Набор',
      rules: [{ id: RULE, label: 'Победители', conditions: [], outputs: [] }],
    });
    const svc = serviceWith({ rows: [] });
    const { problems } = await svc.preview('org', DOCUMENT, withoutTemplate);
    expect(problems.join(' ')).toMatch(/не выбран ни один шаблон/);
  });
});

describe('обрезка длинного протокола', () => {
  it('говорит вслух, что взяты не все строки', async () => {
    const svc = serviceWith({
      rows: [{ id: 'row-1', position: 0, data: { name: 'Иванов', place: '1', category: 'Юноши' } }],
      totalRows: 6000,
    });
    const { problems, plan } = await svc.preview('org', DOCUMENT, draft(OWN_TEMPLATE));

    // Без этого превью показало бы «строк в протоколе — 1» на файле в 6000
    // строк, и расхождение заметили бы уже после награждения.
    expect(problems.join(' ')).toMatch(/Отмечено строк: 6000/);
    expect(problems.join(' ')).toMatch(/5999/);
    expect(plan.totals.rows).toBe(1);
  });

  it('на коротком протоколе не выдумывает предупреждений', async () => {
    const svc = serviceWith({
      rows: [{ id: 'row-1', position: 0, data: { name: 'Иванов', place: '1', category: 'Юноши' } }],
    });
    const { problems } = await svc.preview('org', DOCUMENT, draft(OWN_TEMPLATE));
    expect(problems.join(' ')).not.toMatch(/Отмечено строк/);
  });
});

describe('заготовка правил', () => {
  it('узнаёт колонки протокола и ставит снятых первым правилом', async () => {
    const svc = serviceWith({ columns: ['name', 'place', 'category', 'status'] });
    const suggested = await svc.suggest('org', DOCUMENT);

    expect(suggested.groupColumn).toBe('category');
    expect(suggested.statusColumn).toBe('status');
    expect(suggested.rules[0]).toMatchObject({ action: 'skip', position: 0 });
    // Последним — «иначе»: строка без места не должна остаться ни с чем.
    expect(suggested.rules.at(-1)?.conditions).toEqual([]);
  });

  it('без колонки статуса правило про снятых не выдумывает', async () => {
    const svc = serviceWith({ columns: ['name', 'place'] });
    const suggested = await svc.suggest('org', DOCUMENT);
    expect(suggested.statusColumn).toBe('');
    expect(suggested.rules.every((r) => r.action === 'issue')).toBe(true);
  });
});
