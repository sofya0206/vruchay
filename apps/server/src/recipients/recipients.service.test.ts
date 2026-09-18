import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { mergeField, paragraph, textRun, type SheetLayout } from '@gramota/shared';
import { RecipientsService, renameFieldInLayout } from './recipients.service';

/*
 * Переименование колонки — единственная операция, которая правит и строки,
 * и макеты разом. До этой правки она переносила значения в строках
 * и оставляла макет ссылаться на исчезнувшее имя: грамота печаталась
 * с пустым местом вместо фамилии, и заметить это можно было только
 * по готовому PDF.
 *
 * Prisma подменяем заглушкой: службы под Vitest собираются руками.
 */

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOCUMENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COLUMN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function stub(sheets: { id: string; layout: unknown }[]) {
  const updates: { sheetId: string; layout: SheetLayout; schemaVersion: number }[] = [];
  const rowUpdates: Record<string, string>[] = [];
  const tx = {
    recipientColumn: {
      update: async ({ data }: { data: { name: string } }) => ({ id: COLUMN, documentId: DOCUMENT, name: data.name }),
    },
    recipientRow: {
      findMany: async () => [{ id: 'r1', data: { name: 'Иванов', email: 'i@x.ru' } }],
      update: async ({ data }: { data: { data: Record<string, string> } }) => {
        rowUpdates.push(data.data);
        return {};
      },
    },
    sheet: {
      findMany: async () => sheets,
      update: async ({ where, data }: { where: { id: string }; data: { layout: SheetLayout; schemaVersion: number } }) => {
        updates.push({ sheetId: where.id, layout: data.layout, schemaVersion: data.schemaVersion });
        return {};
      },
    },
  };
  const prisma = {
    document: {
      findFirst: async ({ where }: { where: { orgId: string } }) =>
        where.orgId === ORG ? { id: DOCUMENT } : null,
    },
    recipientColumn: {
      findFirst: async () => ({ id: COLUMN, documentId: DOCUMENT, name: 'name', position: 0 }),
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { service: new RecipientsService(prisma as never), updates, rowUpdates };
}

const legacySheet = {
  id: 's1',
  layout: [
    { id: 'a', type: 'text', x: 0, y: 0, w: 100, h: 10, props: { text: 'Награждается %name' } },
    { id: 'b', type: 'text', x: 0, y: 20, w: 100, h: 10, props: { text: 'Почта: %email' } },
  ],
};

function fieldNames(layout: SheetLayout): string[] {
  const out: string[] = [];
  for (const el of layout) {
    if (el.type !== 'text') continue;
    for (const block of el.props.doc.content) {
      if (block.type !== 'paragraph') continue;
      for (const node of block.content) if (node.type === 'mergeField') out.push(node.attrs.source);
    }
  }
  return out;
}

describe('переименование колонки', () => {
  it('переносит значения в строках и переписывает поле в макете', async () => {
    const { service, updates, rowUpdates } = stub([legacySheet]);
    await service.renameColumn(ORG, DOCUMENT, COLUMN, 'fio');

    expect(rowUpdates).toEqual([{ fio: 'Иванов', email: 'i@x.ru' }]);
    expect(updates).toHaveLength(1);
    expect(fieldNames(updates[0].layout)).toEqual(['fio', 'email']);
    // Макет переписан в текущей версии схемы, поле получило идентификатор колонки.
    expect(updates[0].schemaVersion).toBe(2);
    const first = updates[0].layout[0];
    if (first.type !== 'text') throw new Error('не текст');
    const block = first.props.doc.content[0];
    if (block.type !== 'paragraph') throw new Error('не абзац');
    expect(block.content[1]).toMatchObject({ attrs: { source: 'fio', fieldId: COLUMN } });
  });

  it('лист без этого поля не трогает', async () => {
    const { service, updates } = stub([
      { id: 's2', layout: [{ id: 'a', type: 'text', x: 0, y: 0, w: 100, h: 10, props: { text: 'Только %email' } }] },
    ]);
    await service.renameColumn(ORG, DOCUMENT, COLUMN, 'fio');
    expect(updates).toEqual([]);
  });

  it('чужой документ — «не найден», а не 403', async () => {
    const { service } = stub([legacySheet]);
    await expect(service.renameColumn('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', DOCUMENT, COLUMN, 'fio')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('renameFieldInLayout', () => {
  it('находит поле по идентификатору колонки, даже если имя уже другое', () => {
    const layout = [
      {
        id: 'a',
        type: 'text',
        x: 0,
        y: 0,
        w: 100,
        h: 10,
        props: { doc: { type: 'doc', content: [paragraph([mergeField('old', { fieldId: COLUMN }), textRun(' и '), mergeField('old')])] } },
      },
    ];
    const next = renameFieldInLayout(layout, { fieldId: COLUMN, source: 'name' }, 'fio');
    expect(next && fieldNames(next)).toEqual(['fio', 'old']);
  });

  it('макет, который не разбирается схемой, оставляет как есть', () => {
    expect(renameFieldInLayout([{ type: 'video' }], { fieldId: COLUMN, source: 'name' }, 'fio')).toBeNull();
  });
});

/*
 * Колонка из панели полей приходит названием, а не именем переменной:
 * человек пишет «Команда», и латиницу за него подбирает сервер.
 */
describe('addColumn', () => {
  function addStub(names: string[]) {
    const created: { name: string; title: string | null; position: number }[] = [];
    const prisma = {
      document: {
        findFirst: async ({ where }: { where: { orgId: string } }) =>
          where.orgId === ORG ? { id: DOCUMENT } : null,
      },
      recipientColumn: {
        findMany: async () => names.map((name) => ({ name })),
        create: async ({ data }: { data: { name: string; title: string | null; position: number } }) => {
          created.push(data);
          return { id: COLUMN, documentId: DOCUMENT, ...data };
        },
      },
    };
    return { service: new RecipientsService(prisma as never), created };
  }

  it('по русскому названию подбирает латинское имя и хранит название', async () => {
    const { service, created } = addStub(['name', 'email']);
    await service.addColumn(ORG, DOCUMENT, { title: 'Год рождения' });
    expect(created).toEqual([{ documentId: DOCUMENT, name: 'god_rozhdeniya', title: 'Год рождения', position: 2 }]);
  });

  it('знакомое название становится знакомым именем, занятое — с суффиксом', async () => {
    const { service, created } = addStub(['name', 'email', 'team']);
    await service.addColumn(ORG, DOCUMENT, { title: 'Команда' });
    expect(created[0].name).toBe('team_2');
  });

  it('латинское имя без названия принимает как есть', async () => {
    const { service, created } = addStub(['name']);
    await service.addColumn(ORG, DOCUMENT, { name: 'coach' });
    expect(created[0]).toMatchObject({ name: 'coach', title: null, position: 1 });
  });

  it('чужой документ — 404', async () => {
    const { service } = addStub([]);
    await expect(service.addColumn('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', DOCUMENT, { title: 'Команда' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('перестановка колонок', () => {
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  function make() {
    const positions: Record<string, number> = {};
    const prisma = {
      document: { findFirst: async ({ where }: { where: { orgId: string } }) => (where.orgId === ORG ? { id: DOCUMENT } : null) },
      recipientColumn: {
        findMany: async () => [{ id: A }, { id: B }, { id: C }],
        update: ({ where, data }: { where: { id: string }; data: { position: number } }) => {
          positions[where.id] = data.position;
          return Promise.resolve();
        },
      },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    return { service: new RecipientsService(prisma as never), positions };
  }

  it('ставит колонки в заданном порядке, неупомянутые — следом', async () => {
    const { service, positions } = make();
    await expect(service.reorderColumns(ORG, DOCUMENT, [C, A])).resolves.toEqual({ order: [C, A, B] });
    expect(positions).toEqual({ [C]: 0, [A]: 1, [B]: 2 });
  });

  it('чужая колонка — «не найдена»', async () => {
    const { service } = make();
    await expect(service.reorderColumns(ORG, DOCUMENT, ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
