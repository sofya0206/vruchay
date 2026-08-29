import { describe, expect, it } from 'vitest';
import { MailService } from './mail.service';
import { testConfig } from '../config/env.test-utils';
import { isLastAttempt, MAIL_ATTEMPTS, MAIL_BACKOFF_MS } from './mail.processor';
import type { OutgoingMessage } from './mail-provider.interface';

/*
 * Что происходит с письмом, когда почтовый шлюз ответил отказом.
 *
 * Разница между «шлюз лежал минуту» и «такого ящика нет» — это разница
 * между рассылкой, которая доехала сама, и рассылкой, целиком помеченной
 * «не доставлено». Раньше её не было: любая ошибка гасилась внутри sendOne,
 * наружу не выходила, и очередь со своими тремя попытками ни о чём не знала.
 *
 * Prisma, хранилище и шлюз подменяем заглушками: проверяем решение сервиса,
 * а не работу базы.
 */

const EMAIL_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';

const CONNECTION_REFUSED = 'connect ECONNREFUSED 127.0.0.1:1025';
const NO_SUCH_MAILBOX =
  '550 5.1.1 <ivanov@example.ru>: Recipient address rejected: User unknown in local recipient table';
const DOMAIN_POLICY = '554 5.7.1 Message rejected by domain policy';

interface Stub {
  /** Чем ответил шлюз. Без него письмо уходит успешно. */
  failWith?: string;
  kind?: 'transactional' | 'marketing';
  /** Файл, найденный по идентификатору вложения. null — чужой или удалённый. */
  file?: { originalName: string; s3Key: string; mime: string } | null;
}

interface World {
  service: MailService;
  /** Состояние письма в базе после всех обновлений. */
  email: { status: string; error: string | null };
  sent: OutgoingMessage[];
}

function world(stub: Stub = {}): World {
  const email = {
    id: EMAIL_ID,
    orgId: 'org',
    kind: stub.kind ?? 'transactional',
    toEmail: 'ivanov@example.ru',
    subject: 'Ваш документ',
    provider: 'smtp',
    status: 'queued',
    error: null as string | null,
    rowId: null,
    fileId: null,
    file: null,
    template: {
      bodyHtml: '<p>Ваш документ во вложении.</p>',
      advertiserName: stub.kind === 'marketing' ? 'ООО «Ромашка»' : null,
      sender: { email: 'org@example.ru', displayName: 'Федерация' },
    },
  };

  const sent: OutgoingMessage[] = [];

  const prisma = {
    email: {
      findUnique: async () => email,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(email, data);
        return email;
      },
    },
    emailEvent: { create: async () => ({}) },
    file: {
      findFirst: async () => stub.file ?? null,
    },
    recipientRow: { findUnique: async () => null },
    // Проверочное письмо уходит от отправителя организации, а не от шаблона.
    sender: {
      findFirst: async () => ({
        email: 'org@example.ru',
        displayName: 'Федерация',
        domainId: 'd1',
      }),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  const storage = { getStream: async (key: string) => `поток ${key}` };

  const smtp = {
    name: 'smtp',
    send: async (message: OutgoingMessage) => {
      sent.push(message);
      if (stub.failWith) throw new Error(stub.failWith);
      return { providerMessageId: 'msg-1' };
    },
  };

  return {
    service: new MailService(
      prisma as never,
      storage as never,
      smtp as never,
      testConfig() as never,
    ),
    email,
    sent,
  };
}

describe('временный сбой шлюза', () => {
  it('выпускает ошибку наружу — повторять письмо очереди, а не sendOne', async () => {
    const { service } = world({ failWith: CONNECTION_REFUSED });

    await expect(service.sendOne(EMAIL_ID, false)).rejects.toThrow();
  });

  it('не помечает письмо недоставленным, пока попытки не кончились', async () => {
    const { service, email } = world({ failWith: CONNECTION_REFUSED });

    await service.sendOne(EMAIL_ID, false).catch(() => undefined);

    expect(email.status).toBe('queued');
  });

  it('на последней попытке письмо получает окончательное состояние', async () => {
    const { service, email } = world({ failWith: CONNECTION_REFUSED });

    await expect(service.sendOne(EMAIL_ID, true)).rejects.toThrow();
    expect(email.status).toBe('failed');
  });

  it('в ошибке наружу нет адреса участника: очередь хранит её у себя', async () => {
    const { service } = world({
      failWith: 'connect ECONNREFUSED 127.0.0.1:1025 (ivanov@example.ru)',
    });

    await expect(service.sendOne(EMAIL_ID, false)).rejects.toThrow(/i\*\*\*@example\.ru/);
  });
});

describe('отказ навсегда', () => {
  it('несуществующий ящик не повторяем — ошибка наружу не идёт', async () => {
    const { service } = world({ failWith: NO_SUCH_MAILBOX });

    await expect(service.sendOne(EMAIL_ID, false)).resolves.toBeUndefined();
  });

  it('несуществующий ящик сразу помечен, причина сохранена словами', async () => {
    const { service, email } = world({ failWith: NO_SUCH_MAILBOX });

    await service.sendOne(EMAIL_ID, false);

    expect(email.status).toBe('failed');
    expect(email.error).toContain('User unknown');
    // Адрес получателя в базу и в журнал не размножаем.
    expect(email.error).not.toContain('ivanov@example.ru');
  });

  it('отказ по политике домена тоже не повторяем', async () => {
    const { service, email } = world({ failWith: DOMAIN_POLICY });

    await expect(service.sendOne(EMAIL_ID, false)).resolves.toBeUndefined();
    expect(email.status).toBe('failed');
  });
});

describe('счёт попыток очереди', () => {
  it('первый заход из трёх — не последний', () => {
    expect(isLastAttempt({ attemptsStarted: 1, opts: { attempts: 3 } })).toBe(false);
  });

  it('третий заход из трёх — последний', () => {
    expect(isLastAttempt({ attemptsStarted: 3, opts: { attempts: 3 } })).toBe(true);
  });

  it('без настроек повторов попытка сразу последняя', () => {
    expect(isLastAttempt({})).toBe(true);
  });

  it('повторы переживают минуту недоступности шлюза', () => {
    // Пауза BullMQ при exponential — delay × 2^(номер попытки − 1);
    // складываем паузы перед всеми повторными заходами.
    let window = 0;
    for (let attempt = 1; attempt < MAIL_ATTEMPTS; attempt++) {
      window += MAIL_BACKOFF_MS * 2 ** (attempt - 1);
    }

    // Критерий приёмки: шлюз лежал минуту — письма ушли сами.
    expect(window).toBeGreaterThan(60_000);
  });
});

// Публичный адрес служба берёт из проверенной схемы настроек (ConfigService),
// а не из process.env: подмена переменной окружения тут ничего бы не изменила.
// В testConfig PUBLIC_URL — 'https://vruchay.ru'.
describe('заголовок отписки', () => {
  it('у рекламного письма есть List-Unsubscribe с той же ссылкой, что в подвале', async () => {
    const { service, sent } = world({ kind: 'marketing' });

    await service.sendOne(EMAIL_ID);

    expect(sent[0].listUnsubscribeUrl).toBe(`https://vruchay.ru/api/v1/u/${EMAIL_ID}`);
    expect(sent[0].html).toContain(`/api/v1/u/${EMAIL_ID}`);
  });

  it('у письма о выдаче документа заголовка отписки нет', async () => {
    const { service, sent } = world();

    await service.sendOne(EMAIL_ID);

    expect(sent[0].listUnsubscribeUrl).toBeUndefined();
  });
});

describe('вложение проверочного письма', () => {
  it('прикладывает документ по идентификатору файла', async () => {
    const { service, sent } = world({
      file: { originalName: 'Грамота.pdf', s3Key: 'org/файл.pdf', mime: 'application/pdf' },
    });

    await service.sendPreview('org', 'owner@example.ru', 'Тема', '<p>Текст</p>', FILE_ID);

    expect(sent[0].attachments?.[0].filename).toBe('Грамота.pdf');
  });

  it('чужой файл вложением не становится', async () => {
    const { service, sent } = world({ file: null });

    await service.sendPreview('org', 'owner@example.ru', 'Тема', '<p>Текст</p>', FILE_ID);

    expect(sent[0].attachments).toBeUndefined();
  });
});
