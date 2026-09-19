import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../config/env.test-utils';
import { generatePublicCode } from './public-code';
import { VerifyController, type NotFoundReason } from './verify.controller';

const SECRET = 'x'.repeat(48);

/** Организация-эмитент, какой её читает страница проверки. */
interface Issuer {
  name: string;
  slug: string | null;
  publicPageEnabled: boolean;
  publicIndexable: boolean;
  verifiedIssuer: boolean;
  contactEmail: string;
  website: string;
  verifyNameMode: 'full' | 'initials' | 'none';
}

/** Выданный документ таким, каким его читает страница проверки. */
interface Issued {
  id: string;
  orgId: string;
  publicId: string;
  publicCode: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  expiresAt: Date | null;
  verifyRevoked: boolean;
  revokedAt: Date | null;
  revokedReasonPublic: string | null;
  pdfSha256: string | null;
  signedAt: Date | null;
  issuedData: Record<string, string> | null;
  rowId: string | null;
  replacedById: string | null;
  replacedByJobId: string | null;
  org: Issuer;
  document: {
    title: string;
    eventName: string;
    eventDate: string;
    verifyEnabled: boolean;
    verifyFields: string[];
  } | null;
  row: { data: Record<string, string> } | null;
  rows: { data: Record<string, string> }[];
}

function issuer(over: Partial<Issuer> = {}): Issuer {
  return {
    name: 'Федерация плавания',
    slug: null,
    publicPageEnabled: false,
    publicIndexable: false,
    verifiedIssuer: false,
    contactEmail: '',
    website: '',
    verifyNameMode: 'full',
    ...over,
  };
}

function issued(over: Partial<Issued> = {}): Issued {
  return {
    id: 'file-1',
    orgId: 'org-1',
    publicId: '11111111-1111-4111-8111-111111111111',
    publicCode: null,
    createdAt: new Date('2026-06-17T09:00:00Z'),
    deletedAt: null,
    expiresAt: null,
    verifyRevoked: false,
    revokedAt: null,
    revokedReasonPublic: null,
    pdfSha256: null,
    signedAt: null,
    issuedData: null,
    rowId: 'row-1',
    replacedById: null,
    replacedByJobId: null,
    org: issuer(),
    document: {
      title: 'Грамота',
      eventName: 'Первенство области',
      eventDate: '17 июня 2026',
      verifyEnabled: true,
      verifyFields: ['name'],
    },
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
    { count: async () => ({ counted: true, unique: true }) } as never,
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

describe('страница проверки: отзыв, эмитент и снимок данных', () => {
  it('отозванный — это 200 и красная страница с причиной, а не «не найдено»', async () => {
    const revokedAt = new Date('2026-07-01T10:00:00Z');
    const { controller } = controllerWith([
      issued({ verifyRevoked: true, revokedAt, revokedReasonPublic: 'Выдан по ошибке' }),
    ]);
    const answer = await controller.check('11111111-1111-4111-8111-111111111111');
    expect(answer.state).toBe('revoked');
    expect(answer.valid).toBe(false);
    expect(answer.revoked).toBe(true);
    expect(answer.revokedAt).toEqual(revokedAt);
    expect(answer.revokedReason).toBe('Выдан по ошибке');
    // Получателя на красной странице не называем: причина может быть
    // неприятной, и связывать её с фамилией на открытой странице нельзя.
    expect(answer.fields).toEqual({});
    expect(answer.title).toBe('Грамота');
  });

  it('отзыв сильнее замены и срока', async () => {
    const { controller } = controllerWith([
      issued({ verifyRevoked: true, replacedById: 'new', expiresAt: new Date(0) }),
    ]);
    const answer = await controller.check('11111111-1111-4111-8111-111111111111');
    expect(answer.state).toBe('revoked');
    expect(answer.replacedBy).toBeNull();
  });

  it('показывает получателя так, как разрешил эмитент', async () => {
    const initials = issued({ org: issuer({ verifyNameMode: 'initials' }) });
    const { controller } = controllerWith([initials]);
    const answer = await controller.check(initials.publicId);
    expect(answer.fields.name.replace(/\u00a0/g, ' ')).toBe('Иванов П. И.');

    const none = issued({ org: issuer({ verifyNameMode: 'none' }) });
    const nothing = await controllerWith([none]).controller.check(none.publicId);
    expect(nothing.fields).toEqual({});
    expect(nothing.issuer.name).toBe('Федерация плавания');
  });

  it('читает снимок на момент выпуска, а не живую строку', async () => {
    const { controller } = controllerWith([
      issued({
        issuedData: { name: 'Иванов Пётр Ильич' },
        row: { data: { name: 'Иванов Петр Ильич (исправлено)' } },
      }),
    ]);
    const answer = await controller.check('11111111-1111-4111-8111-111111111111');
    expect(answer.fields).toEqual({ name: 'Иванов Пётр Ильич' });
  });

  it('отдаёт эмитента, отпечаток и решение об индексации', async () => {
    const { controller } = controllerWith([
      issued({
        pdfSha256: 'ab'.repeat(32),
        org: issuer({
          slug: 'federation',
          publicPageEnabled: true,
          publicIndexable: true,
          verifiedIssuer: true,
          contactEmail: 'docs@federation.ru',
        }),
      }),
    ]);
    const answer = await controller.check('11111111-1111-4111-8111-111111111111');
    expect(answer.sha256).toBe('ab'.repeat(32));
    expect(answer.indexable).toBe(true);
    expect(answer.issuer).toEqual({
      name: 'Федерация плавания',
      verified: true,
      publicPath: '/org/federation',
      contactEmail: 'docs@federation.ru',
      website: null,
    });
    expect(answer.event).toEqual({ name: 'Первенство области', date: '17 июня 2026' });
  });

  it('страница без адреса не показывается ссылкой', async () => {
    const { controller } = controllerWith([
      issued({ org: issuer({ slug: 'federation', publicPageEnabled: false }) }),
    ]);
    const answer = await controller.check('11111111-1111-4111-8111-111111111111');
    expect(answer.issuer.publicPath).toBeNull();
  });

  it('удалённый файл не проверяется', async () => {
    const { controller } = controllerWith([issued({ deletedAt: new Date() })]);
    expect(
      await notFoundReason(() => controller.check('11111111-1111-4111-8111-111111111111')),
    ).toBe('unknown');
  });

  it('ставит кэш на минуту действующему и запрещает кэш остальным', async () => {
    const headers: Record<string, string> = {};
    const reply = { header: (k: string, v: string) => void (headers[k] = v) } as never;

    await controllerWith([issued()]).controller.check(
      '11111111-1111-4111-8111-111111111111',
      reply,
    );
    expect(headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=60');

    await controllerWith([issued({ verifyRevoked: true })]).controller.check(
      '11111111-1111-4111-8111-111111111111',
      reply,
    );
    expect(headers['cache-control']).toBe('no-store');
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
    const off = issued({
      document: {
        title: 'Грамота',
        eventName: '',
        eventDate: '',
        verifyEnabled: false,
        verifyFields: [],
      },
    });
    const { controller } = controllerWith([off]);
    expect(await notFoundReason(() => controller.check(off.publicId))).toBe('unknown');
    expect(
      await notFoundReason(() => controller.check('22222222-2222-4222-8222-222222222222')),
    ).toBe('unknown');
  });
});
