import { describe, expect, it } from 'vitest';
import { testConfig } from '../config/env.test-utils';
import { ExpiryNoticeService } from './expiry-notice.service';

/** Выданный документ, каким его видит утренняя задача. */
interface Issued {
  id: string;
  orgId: string;
  documentId: string | null;
  rowId: string | null;
  publicId: string;
  publicCode: string | null;
  expiresAt: Date | null;
  expiryNoticeAt: Date | null;
  verifyRevoked: boolean;
  replacedById: string | null;
  row: { data: Record<string, string> } | null;
  document: { title: string; eventName: string; deletedAt: Date | null; org: { name: string } };
}

const NOW = new Date('2026-06-01T04:15:00.000Z');
const IN_10_DAYS = new Date('2026-06-11T00:00:00.000Z');
const IN_60_DAYS = new Date('2026-07-31T00:00:00.000Z');

function issued(over: Partial<Issued> = {}): Issued {
  return {
    id: 'file-1',
    orgId: 'org-1',
    documentId: 'doc-1',
    rowId: 'row-1',
    publicId: '11111111-1111-4111-8111-111111111111',
    publicCode: 'K7M2-9QXR-4TVB',
    expiresAt: IN_10_DAYS,
    expiryNoticeAt: null,
    verifyRevoked: false,
    replacedById: null,
    row: { data: { name: 'Иванов Пётр', email: 'ivanov@example.ru' } },
    document: {
      title: 'Допуск',
      eventName: 'Сезон 2026',
      deletedAt: null,
      org: { name: 'Федерация' },
    },
    ...over,
  };
}

function serviceWith(files: Issued[], over: Record<string, unknown> = {}) {
  const notices: { toEmail: string; subject: string; bodyHtml: string; fileId: string }[] = [];
  const enqueued: string[] = [];
  let emails = 0;

  const prisma = {
    file: {
      // Тот же отбор, что и в бою, воспроизведён в памяти: истекает
      // в окне, не отозван, не заменён, письмо ещё не уходило.
      findMany: async ({
        where,
        take,
      }: {
        where: { expiresAt: { gt: Date; lte: Date } };
        take: number;
      }) =>
        files
          .filter(
            (f) =>
              f.expiresAt !== null &&
              f.expiresAt > where.expiresAt.gt &&
              f.expiresAt <= where.expiresAt.lte &&
              !f.verifyRevoked &&
              f.replacedById === null &&
              f.expiryNoticeAt === null &&
              f.document.deletedAt === null,
          )
          .slice(0, take),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { expiryNoticeAt: Date };
      }) => {
        const file = files.find((f) => f.id === where.id)!;
        file.expiryNoticeAt = data.expiryNoticeAt;
        return file;
      },
    },
  };
  const mail = {
    queueNotice: async (_orgId: string, notice: (typeof notices)[number]) => {
      notices.push(notice);
      return `email-${++emails}`;
    },
  };
  const processor = { enqueue: async (id: string) => void enqueued.push(id) };

  const service = new ExpiryNoticeService(
    prisma as never,
    mail as never,
    processor as never,
    testConfig({ EXPIRY_NOTICE_DAYS: '30', ...over }) as never,
  );
  return { service, notices, enqueued };
}

describe('утреннее уведомление о сроке действия', () => {
  it('ставит письмо тому, чей документ истекает в ближайший месяц, и только один раз', async () => {
    const files = [issued()];
    const { service, notices, enqueued } = serviceWith(files);

    const first = await service.run(NOW);
    expect(first).toEqual({ queued: 1, skipped: 0 });
    expect(notices).toHaveLength(1);
    expect(notices[0].toEmail).toBe('ivanov@example.ru');
    expect(notices[0].subject).toContain('«Допуск»');
    expect(notices[0].bodyHtml).toContain('/c/K7M2-9QXR-4TVB');
    expect(enqueued).toEqual(['email-1']);
    expect(files[0].expiryNoticeAt).toEqual(NOW);

    // Следующее утро — документ уже отмечен, письма нет.
    const second = await service.run(new Date(NOW.getTime() + 86_400_000));
    expect(second).toEqual({ queued: 0, skipped: 0 });
    expect(notices).toHaveLength(1);
  });

  it('до истечения ещё далеко — не трогает', async () => {
    const { service, notices } = serviceWith([issued({ expiresAt: IN_60_DAYS })]);
    expect(await service.run(NOW)).toEqual({ queued: 0, skipped: 0 });
    expect(notices).toHaveLength(0);
  });

  it('уже истёкший, отозванный и заменённый уведомления не получают', async () => {
    const { service, notices } = serviceWith([
      issued({ id: 'past', expiresAt: new Date('2026-05-01T00:00:00.000Z') }),
      issued({ id: 'revoked', verifyRevoked: true }),
      issued({ id: 'replaced', replacedById: 'new' }),
    ]);
    expect(await service.run(NOW)).toEqual({ queued: 0, skipped: 0 });
    expect(notices).toHaveLength(0);
  });

  it('без адреса слать некуда — помечает и не возвращается', async () => {
    const files = [issued({ row: { data: { name: 'Без почты' } } })];
    const { service, notices } = serviceWith(files);
    expect(await service.run(NOW)).toEqual({ queued: 0, skipped: 1 });
    expect(notices).toHaveLength(0);
    expect(files[0].expiryNoticeAt).toEqual(NOW);
  });

  it('отказ почты не роняет заход: документ помечен, причина в журнале', async () => {
    const files = [
      issued({ id: 'a' }),
      issued({ id: 'b', row: { data: { email: 'b@example.ru' } } }),
    ];
    const { service, notices } = serviceWith(files);
    // Первое письмо не ставится — например, домен отправителя не подтверждён.
    const original = (service as unknown as { mail: { queueNotice: () => Promise<string> } }).mail;
    let calls = 0;
    const queueNotice = original.queueNotice;
    original.queueNotice = async (...args: unknown[]) => {
      if (++calls === 1) throw new Error('Домен отправителя не подтверждён');
      return (queueNotice as (...a: unknown[]) => Promise<string>)(...args);
    };

    expect(await service.run(NOW)).toEqual({ queued: 1, skipped: 1 });
    expect(notices).toHaveLength(1);
    expect(files.every((f) => f.expiryNoticeAt !== null)).toBe(true);
  });

  it('нулевое число дней выключает уведомления', async () => {
    const { service, notices } = serviceWith([issued()], { EXPIRY_NOTICE_DAYS: '0' });
    expect(await service.run(NOW)).toEqual({ queued: 0, skipped: 0 });
    expect(notices).toHaveLength(0);
  });
});
