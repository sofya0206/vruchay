import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../config/env.test-utils';
import { generatePublicCode } from './public-code';
import { VerifyController, type NotFoundReason } from './verify.controller';

const SECRET = 'x'.repeat(48);

/** Выданный документ таким, каким его читает страница проверки. */
interface Issued {
  id: string;
  orgId: string;
  publicId: string;
  publicCode: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  verifyRevoked: boolean;
  rowId: string | null;
  replacedById: string | null;
  replacedByJobId: string | null;
  document: { title: string; verifyEnabled: boolean; verifyFields: string[] } | null;
  row: { data: Record<string, string> } | null;
  rows: { data: Record<string, string> }[];
}

function issued(over: Partial<Issued> = {}): Issued {
  return {
    id: 'file-1',
    orgId: 'org-1',
    publicId: '11111111-1111-4111-8111-111111111111',
    publicCode: null,
    createdAt: new Date('2026-06-17T09:00:00Z'),
    expiresAt: null,
    verifyRevoked: false,
    rowId: 'row-1',
    replacedById: null,
    replacedByJobId: null,
    document: { title: 'Грамота', verifyEnabled: true, verifyFields: ['name'] },
    row: { data: { name: 'Иванов Пётр Ильич', email: 'ivanov@example.ru' } },
    rows: [],
    ...over,
  };
}

function controllerWith(files: Issued[]) {
  const lookups: unknown[] = [];
  const prisma = {
    file: {
      findUnique: async ({ where }: { where: { publicId?: string; publicCode?: string } }) => {
        lookups.push(where);
        return (
          files.find((f) =>
            where.publicId !== undefined
              ? f.publicId === where.publicId
              : f.publicCode === where.publicCode,
          ) ?? null
        );
      },
      findFirst: async () => null,
      update: async () => ({}),
    },
  };
  const replacement = { settleOne: async (file: Issued) => file.replacedById };
  const controller = new VerifyController(
    prisma as never,
    replacement as never,
    testConfig({ SESSION_SECRET: SECRET }) as never,
  );
  return { controller, lookups };
}

async function notFoundReason(call: () => Promise<unknown>): Promise<NotFoundReason> {
  try {
    await call();
  } catch (err) {
    expect(err).toBeInstanceOf(NotFoundException);
    return ((err as NotFoundException).getResponse() as { reason: NotFoundReason }).reason;
  }
  throw new Error('ожидали «не найдено»');
}

describe('страница проверки: старый UUID и новый код', () => {
  it('документ, выпущенный до появления кода, находится по UUID из старого QR', async () => {
    const { controller, lookups } = controllerWith([issued()]);

    const answer = await controller.check('11111111-1111-4111-8111-111111111111');

    expect(answer.valid).toBe(true);
    expect(answer.code).toBe('11111111-1111-4111-8111-111111111111');
    expect(lookups).toEqual([{ publicId: '11111111-1111-4111-8111-111111111111' }]);
  });

  it('UUID принимается и в верхнем регистре — так его копируют из адресной строки', async () => {
    const { controller } = controllerWith([issued()]);
    const answer = await controller.check('11111111-1111-4111-8111-111111111111'.toUpperCase());
    expect(answer.valid).toBe(true);
  });

  it('новый документ находится по короткому коду в любом написании', async () => {
    const code = generatePublicCode(SECRET);
    const { controller } = controllerWith([issued({ publicCode: code })]);

    for (const typed of [
      code,
      code.toLowerCase(),
      code.replace(/-/g, ''),
      code.replace(/-/g, ' ').replace(/0/g, 'O').replace(/1/g, 'I'),
    ]) {
      const answer = await controller.check(typed);
      expect(answer.valid, typed).toBe(true);
      expect(answer.code).toBe(code);
    }
  });

  it('у нового документа остаётся и старый UUID — ссылка на него тоже работает', async () => {
    const code = generatePublicCode(SECRET);
    const { controller } = controllerWith([issued({ publicCode: code })]);

    const answer = await controller.check('11111111-1111-4111-8111-111111111111');
    expect(answer.valid).toBe(true);
    // Показываем при этом код с бумаги, а не UUID из адреса.
    expect(answer.code).toBe(code);
  });

  it('показывает только отмеченные поля', async () => {
    const { controller } = controllerWith([issued()]);
    const answer = await controller.check('11111111-1111-4111-8111-111111111111');
    expect(answer.fields).toEqual({ name: 'Иванов Пётр Ильич' });
  });
});

describe('страница проверки: срок действия', () => {
  it('до истечения документ действителен и показывает, до какого числа', async () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    const { controller } = controllerWith([issued({ expiresAt: soon })]);
    const answer = await controller.check('11111111-1111-4111-8111-111111111111');
    expect(answer.valid).toBe(true);
    expect(answer.expired).toBe(false);
    expect(answer.state).toBe('valid');
    expect(answer.expiresAt).toEqual(soon);
  });

  it('истёкший — это 200 с жёлтой страницей, а не «не найдено»', async () => {
    const past = new Date(Date.now() - 1000);
    const { controller } = controllerWith([issued({ expiresAt: past })]);
    const answer = await controller.check('11111111-1111-4111-8111-111111111111');
    expect(answer.valid).toBe(false);
    expect(answer.expired).toBe(true);
    expect(answer.state).toBe('expired');
    // Поля остаются: документ был настоящим, и человеку это надо видеть.
    expect(answer.fields).toEqual({ name: 'Иванов Пётр Ильич' });
  });

  it('заменённый документ показывает замену, а не истечение срока', async () => {
    const past = new Date(Date.now() - 1000);
    const { controller } = controllerWith([issued({ expiresAt: past, replacedById: 'new' })]);
    const answer = await controller.check('11111111-1111-4111-8111-111111111111');
    expect(answer.replaced).toBe(true);
    expect(answer.expired).toBe(false);
  });
});

describe('страница проверки: «не найдено» с причиной', () => {
  it('мусор вместо кода — «не похоже на код», и в базу не ходим', async () => {
    const { controller, lookups } = controllerWith([issued()]);
    expect(await notFoundReason(() => controller.check('грамота'))).toBe('malformed');
    expect(await notFoundReason(() => controller.check('K7M2-9QXR'))).toBe('malformed');
    expect(lookups).toEqual([]);
  });

  it('опечатка в коде — «похоже на опечатку», но базу всё же спрашиваем', async () => {
    const code = generatePublicCode(SECRET);
    const { controller, lookups } = controllerWith([issued({ publicCode: code })]);

    const raw = code.replace(/-/g, '');
    const other = raw[0] === 'A' ? 'B' : 'A';
    const typo = other + raw.slice(1);

    expect(await notFoundReason(() => controller.check(typo))).toBe('checksum');
    // Хвост мог быть посчитан прежним секретом: код с несошедшимся
    // хвостом всё равно ищется в базе, и найденный документ отдаётся.
    expect(lookups).toHaveLength(1);
  });

  it('код с сошедшимся хвостом, которого нет в базе, — просто «не найден»', async () => {
    const { controller } = controllerWith([issued()]);
    const stranger = generatePublicCode(SECRET);
    expect(await notFoundReason(() => controller.check(stranger))).toBe('unknown');
  });

  it('код, посчитанный другим секретом, находится, если он есть в базе', async () => {
    const foreign = generatePublicCode('y'.repeat(48));
    const { controller } = controllerWith([issued({ publicCode: foreign })]);
    const answer = await controller.check(foreign);
    expect(answer.valid).toBe(true);
  });

  it('выключенная проверка и неизвестный UUID отвечают одинаково', async () => {
    const off = issued({ document: { title: 'Грамота', verifyEnabled: false, verifyFields: [] } });
    const { controller } = controllerWith([off]);
    expect(await notFoundReason(() => controller.check(off.publicId))).toBe('unknown');
    expect(
      await notFoundReason(() => controller.check('22222222-2222-4222-8222-222222222222')),
    ).toBe('unknown');
  });
});
