import { describe, expect, it } from 'vitest';
import { MailingService } from './mailing.service';
import { testConfig } from '../config/env.test-utils';

/*
 * Две беды рассылки, которые не видны ни по одному зелёному тесту:
 *
 *  — «письмо себе» обещает документ во вложении и уходит без него, хотя
 *    кнопка существует ровно ради ответа на вопрос «что получит участник»;
 *  — защита от повторной отправки считалась по всем письмам материала
 *    без учёта потока, поэтому письмо о выдаче закрывало адрес и для
 *    рекламы: по материалу, где выдача прошла, рекламная рассылка
 *    не уходила никому.
 *
 * Prisma и почту подменяем заглушками: проверяется решение сервиса.
 */

const DOCUMENT = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';

interface StubEmail {
  id?: string;
  kind: 'transactional' | 'marketing';
  toEmail: string;
  status: string;
  error?: string | null;
}

interface Stub {
  template?: {
    kind?: 'transactional' | 'marketing';
    attachGeneratedFile?: boolean;
    bodyHtml?: string;
  };
  /** Первая строка таблицы: по ней собирается и превью, и письмо себе. */
  row?: { data: Record<string, string>; lastFileId: string | null } | null;
  /** Что уже лежит в журнале писем по этому материалу. */
  emails?: StubEmail[];
  /** Кто согласился получать рекламу. */
  consented?: string[];
}

interface Preview {
  to: string;
  subject: string;
  html: string;
  fileId: string | null | undefined;
}

interface World {
  service: MailingService;
  previews: Preview[];
  /** Письма, созданные переотправкой недоставленных. */
  created: { kind: string; toEmail: string }[];
}

function world(stub: Stub = {}): World {
  const template = {
    id: 'template-1',
    kind: stub.template?.kind ?? 'transactional',
    subject: 'Ваш документ, %name',
    bodyHtml: stub.template?.bodyHtml ?? '<p>Ваш документ во вложении к этому письму.</p>',
    attachGeneratedFile: stub.template?.attachGeneratedFile ?? true,
    advertiserName: stub.template?.kind === 'marketing' ? 'ООО «Ромашка»' : null,
    senderId: null,
    sender: null,
  };

  const row =
    stub.row === undefined
      ? { data: { name: 'Иванов Иван', email: 'ivanov@example.ru' }, lastFileId: FILE }
      : stub.row;

  const emails = stub.emails ?? [];
  const previews: Preview[] = [];
  const created: { kind: string; toEmail: string }[] = [];

  const prisma = {
    document: {
      findFirst: async () => ({ id: DOCUMENT, title: 'Первенство области' }),
      findMany: async () => [{ id: DOCUMENT, title: 'Первенство области' }],
    },
    emailTemplate: { findFirst: async () => template },
    recipientRow: {
      findFirst: async () => row,
      findMany: async () =>
        row ? [{ id: ROW, data: row.data, lastFileId: row.lastFileId }] : [],
    },
    email: {
      findMany: async ({
        where,
      }: {
        where: { kind?: string; status: { in: string[] } };
      }) =>
        emails
          .filter((e) => (where.kind ? e.kind === where.kind : true))
          .filter((e) => where.status.in.includes(e.status))
          .map((e, i) => ({
            id: e.id ?? `email-${i}`,
            documentId: DOCUMENT,
            rowId: null,
            templateId: template.id,
            fileId: null,
            kind: e.kind,
            toEmail: e.toEmail,
            subject: 'Ваш документ',
            provider: 'smtp',
            status: e.status,
            error: e.error ?? null,
          })),
      create: async ({ data }: { data: { kind: string; toEmail: string } }) => {
        created.push({ kind: data.kind, toEmail: data.toEmail });
        return { id: `new-${created.length}` };
      },
    },
    consent: {
      findMany: async () =>
        (stub.consented ?? []).map((email) => ({ subjectEmail: email, granted: true })),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  const mail = {
    sendingRefusal: async () => null,
    volumeRefusal: async () => null,
    sendPreview: async (
      _orgId: string,
      to: string,
      subject: string,
      html: string,
      fileId?: string | null,
    ) => {
      previews.push({ to, subject, html, fileId });
    },
  };

  const processor = { enqueue: async () => undefined };

  return {
    service: new MailingService(
      prisma as never,
      mail as never,
      processor as never,
      testConfig() as never,
    ),
    previews,
    created,
  };
}

describe('письмо себе показывает то же, что получит участник', () => {
  it('прикладывает документ той же строки, что показана в превью', async () => {
    const { service, previews } = world();

    await service.testSend('org', 'owner@example.ru', DOCUMENT, 'transactional');

    expect(previews[0].fileId).toBe(FILE);
  });

  it('говорит прямо, что документа ещё нет, а не обещает вложение', async () => {
    const { service, previews } = world({
      row: { data: { name: 'Иванов Иван', email: 'ivanov@example.ru' }, lastFileId: null },
    });

    await service.testSend('org', 'owner@example.ru', DOCUMENT, 'transactional');

    expect(previews[0].fileId).toBeFalsy();
    expect(previews[0].html).toContain('ещё не выпущен');
  });

  it('без галочки «прикладывать документ» вложения нет и оправдываться не в чем', async () => {
    const { service, previews } = world({ template: { attachGeneratedFile: false } });

    await service.testSend('org', 'owner@example.ru', DOCUMENT, 'transactional');

    expect(previews[0].fileId).toBeFalsy();
    expect(previews[0].html).not.toContain('ещё не выпущен');
  });
});

describe('защита от дублей считается внутри своего потока', () => {
  const marketing = {
    template: { kind: 'marketing' as const, attachGeneratedFile: false },
    consented: ['ivanov@example.ru'],
  };

  it('выданный документ не закрывает адрес для рекламной рассылки', async () => {
    const { service } = world({
      ...marketing,
      emails: [{ kind: 'transactional', toEmail: 'ivanov@example.ru', status: 'sent' }],
    });

    const audience = await service.audience('org', DOCUMENT, {
      kind: 'marketing',
      source: 'table',
    });

    expect(audience.willSend).toBe(1);
  });

  it('второй запуск той же рекламной рассылки писем не добавляет', async () => {
    const { service } = world({
      ...marketing,
      emails: [{ kind: 'marketing', toEmail: 'ivanov@example.ru', status: 'sent' }],
    });

    const audience = await service.audience('org', DOCUMENT, {
      kind: 'marketing',
      source: 'table',
    });

    expect(audience.willSend).toBe(0);
    expect(audience.skipped[0].reason).toContain('уже уходило');
  });

  it('повторная выдача документа по-прежнему не уходит дважды', async () => {
    const { service } = world({
      template: { attachGeneratedFile: false },
      emails: [{ kind: 'transactional', toEmail: 'ivanov@example.ru', status: 'sent' }],
    });

    const audience = await service.audience('org', DOCUMENT, {
      kind: 'transactional',
      source: 'table',
    });

    expect(audience.willSend).toBe(0);
  });
});

describe('переотправка недоставленных', () => {
  it('ушедшее письмо о выдаче не отменяет повтор рекламного', async () => {
    const { service, created } = world({
      emails: [
        {
          kind: 'marketing',
          toEmail: 'ivanov@example.ru',
          status: 'failed',
          error: '451 4.7.1 Try again later',
        },
        { kind: 'transactional', toEmail: 'ivanov@example.ru', status: 'sent' },
      ],
    });

    const result = await service.resendFailed('org', DOCUMENT);

    expect(result.queued).toBe(1);
    expect(created[0].kind).toBe('marketing');
  });

  it('ушедшее письмо того же потока повтор отменяет', async () => {
    const { service } = world({
      emails: [
        {
          kind: 'marketing',
          toEmail: 'ivanov@example.ru',
          status: 'failed',
          error: '451 4.7.1 Try again later',
        },
        { kind: 'marketing', toEmail: 'ivanov@example.ru', status: 'sent' },
      ],
    });

    const result = await service.resendFailed('org', DOCUMENT);

    expect(result.queued).toBe(0);
  });
});
