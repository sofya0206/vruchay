import { describe, expect, it, vi } from 'vitest';
import { DigestService, digestLetter, periodKey } from './digest.service';

/*
 * Ежемесячная сводка.
 *
 * Проверяем то, чего не видно, пока не случится: что письмо уходит
 * за прошлый месяц, а не за текущий; что второй запуск не пришлёт
 * второе такое же письмо; что название организации экранируется;
 * и что ни в журнал, ни в отметку о рассылке не попадают адреса.
 */

const NOW = new Date('2026-09-01T06:00:00Z');
/** Границы августа по Москве. */
const AUGUST = {
  from: new Date('2026-07-31T21:00:00.000Z'),
  to: new Date('2026-08-31T21:00:00.000Z'),
};

interface Setup {
  activeFiles?: string[];
  activeEmails?: string[];
  alreadySent?: string[];
  owners?: Record<string, string[]>;
  orgNames?: Record<string, string>;
}

function serviceWith({
  activeFiles = [],
  activeEmails = [],
  alreadySent = [],
  owners = {},
  orgNames = {},
}: Setup) {
  const audit: Record<string, unknown>[] = [];
  const sent: { to: string; subject: string; html: string }[] = [];
  const monthCalls: { orgId: string; from: Date; to: Date }[] = [];

  const prisma = {
    file: {
      groupBy: vi.fn(async () => activeFiles.map((orgId) => ({ orgId, _count: { _all: 1 } }))),
    },
    email: {
      groupBy: vi.fn(async () => activeEmails.map((orgId) => ({ orgId, _count: { _all: 1 } }))),
    },
    auditEvent: {
      findFirst: vi.fn(async (args: { where: { orgId: string } }) =>
        alreadySent.includes(args.where.orgId) ? { id: 1n } : null,
      ),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        audit.push(args.data);
        return args.data;
      }),
    },
    organization: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => ({
        name: orgNames[args.where.id] ?? 'Федерация',
        members: (owners[args.where.id] ?? ['owner@example.org']).map((email) => ({
          user: { email },
        })),
      })),
    },
  };

  const config = {
    get: vi.fn((key: string) =>
      key === 'PUBLIC_URL' ? 'https://vruchay.ru/' : key === 'RUN_WORKER' ? false : '',
    ),
  };

  const mail = {
    sendService: vi.fn(async (to: string, subject: string, html: string) => {
      sent.push({ to, subject, html });
    }),
  };

  const metrics = {
    forMonth: vi.fn(async (orgId: string, from: Date, to: Date) => {
      monthCalls.push({ orgId, from, to });
      return { title: 'август 2026', issued: 340, mailed: 320, verifiedFiles: 96 };
    }),
    verificationsTotal: vi.fn(async () => 512),
  };

  const service = new DigestService(
    prisma as never,
    config as never,
    mail as never,
    metrics as never,
  );

  return { service, audit, sent, monthCalls, prisma };
}

describe('рассылка сводок', () => {
  it('считает прошлый месяц, а не текущий', async () => {
    const { service, monthCalls } = serviceWith({ activeFiles: ['org-1'] });
    await service.run(NOW);

    expect(monthCalls).toHaveLength(1);
    expect(monthCalls[0]).toMatchObject({ orgId: 'org-1', from: AUGUST.from, to: AUGUST.to });
  });

  it('письмо уходит владельцу организации', async () => {
    const { service, sent } = serviceWith({
      activeFiles: ['org-1'],
      owners: { 'org-1': ['sonya@example.org'] },
    });

    const result = await service.run(NOW);
    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('sonya@example.org');
    expect(sent[0].subject).toContain('август');
    expect(sent[0].html).toContain('340');
  });

  it('организацию, которой сводку уже слали, второй раз не тревожим', async () => {
    const { service, sent } = serviceWith({
      activeFiles: ['org-1', 'org-2'],
      alreadySent: ['org-1'],
    });

    const result = await service.run(NOW);
    expect(result).toEqual({ sent: 1, skipped: 1 });
    expect(sent).toHaveLength(1);
  });

  it('организации без событий за месяц письма не получают', async () => {
    const { service, sent } = serviceWith({});
    const result = await service.run(NOW);

    expect(result).toEqual({ sent: 0, skipped: 0 });
    expect(sent).toHaveLength(0);
  });

  it('организацию считаем активной и по выпуску, и по рассылке — но один раз', async () => {
    const { service, sent } = serviceWith({
      activeFiles: ['org-1'],
      activeEmails: ['org-1', 'org-2'],
    });

    await service.run(NOW);
    expect(sent.map((s) => s.to)).toHaveLength(2);
  });

  it('в отметке о рассылке нет адресов', async () => {
    const { service, audit } = serviceWith({
      activeFiles: ['org-1'],
      owners: { 'org-1': ['sonya@example.org'] },
    });
    await service.run(NOW);

    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0])).not.toContain('sonya@example.org');
    expect(audit[0]).toMatchObject({
      orgId: 'org-1',
      action: 'analytics.digest',
      targetType: 'month',
      targetId: '2026-08',
    });
  });

  it('организация без владельца пропускается, а остальные получают сводку', async () => {
    const { service, sent } = serviceWith({
      activeFiles: ['org-1', 'org-2'],
      owners: { 'org-1': [] },
    });

    const result = await service.run(NOW);
    expect(result).toEqual({ sent: 1, skipped: 1 });
    expect(sent).toHaveLength(1);
  });

  it('сбой отправки одной организации не отменяет остальные', async () => {
    const { service, sent } = serviceWith({ activeFiles: ['org-1', 'org-2'] });
    const mail = service as unknown as { mail: { sendService: ReturnType<typeof vi.fn> } };
    mail.mail.sendService.mockRejectedValueOnce(new Error('шлюз молчит'));

    const result = await service.run(NOW);
    expect(result).toEqual({ sent: 1, skipped: 1 });
    expect(sent).toHaveLength(1);
  });
});

describe('текст письма', () => {
  const letter = digestLetter({
    orgName: 'Федерация «Стрела» <спорт>',
    numbers: { title: 'август 2026', issued: 340, mailed: 320, verifiedFiles: 96 },
    verificationsTotal: 512,
    analyticsUrl: 'https://vruchay.ru/analytics',
  });

  it('называет все три числа', () => {
    expect(letter.html).toContain('340');
    expect(letter.html).toContain('320');
    expect(letter.html).toContain('96');
    expect(letter.html).toContain('512');
  });

  it('название организации экранируется', () => {
    expect(letter.html).not.toContain('<спорт>');
    expect(letter.html).toContain('&lt;спорт&gt;');
  });

  it('говорит, что это служебное письмо, а не рассылка', () => {
    expect(letter.html).toMatch(/не рассылка/);
    expect(letter.html).toContain('https://vruchay.ru/analytics');
  });
});

describe('ключ периода', () => {
  it('месяц берётся по Москве', () => {
    expect(periodKey(new Date('2026-07-31T21:00:00.000Z'))).toBe('2026-08');
  });
});
