import { Readable } from 'node:stream';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testConfig } from '../config/env.test-utils';
import {
  attachmentName,
  DashaMailProvider,
  issuedRecords,
  refusalOf,
  sendPayload,
} from './dashamail.provider';
import { PermanentSendError, type OutgoingMessage } from './mail-provider.interface';
import { createMailProvider } from './mail-provider.factory';
import { SmtpProvider } from './smtp.provider';
import { SERVICE_REF_PREFIX } from './webhook-events';

vi.mock('./dns-check', async (original) => ({
  ...(await original<typeof import('./dns-check')>()),
  checkRecords: vi.fn(async () => 'verified'),
}));
const { checkRecords } = await import('./dns-check');

/*
 * Провайдер DashaMail без сети: fetch подменён, ответы — в форме
 * из документации (dashamail.ru/api/transactional, /api/account, /api/errors).
 *
 * Главное здесь не «уходит ли запрос», а решения провайдера: что считать
 * отказом навсегда, какой номер письма вернуть, какие записи DNS показать
 * владельцу домена и не утечёт ли ключ в адрес запроса.
 */

const KEY = 'test-key-not-real';
const REF = '3f7a1b2c-4d5e-4f70-8192-a3b4c5d6e7f8';

const ok = (data: unknown, status = 201) =>
  new Response(
    JSON.stringify({ response: { msg: { err_code: 0, text: 'OK', type: 'message' }, data } }),
    { status },
  );
const fail = (status: number, code: number, message: string) =>
  new Response(JSON.stringify({ error: { code, message } }), { status });

const DOMAIN_RECORDS = [
  {
    record_type: 'TXT',
    name: 'example.ru.',
    value: 'v=spf1 include:_spf.dashasender.ru ~all',
    valid: 0,
  },
  {
    record_type: 'TXT',
    name: 'dm2._domainkey.example.ru.',
    value: 'v=DKIM1;p=MIIBIjANBgkq;t=s',
    valid: 0,
  },
  { record_type: 'CNAME', name: 'stat.example.ru.', value: 'stat.dashamail.com.', valid: 0 },
];

function message(over: Partial<OutgoingMessage> = {}): OutgoingMessage {
  return {
    from: { email: 'noreply@vruchay.ru', name: 'Федерация' },
    to: 'ivanov@example.ru',
    subject: 'Ваш документ',
    html: '<p>Ваш документ во вложении.</p>',
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
const provider = () =>
  new DashaMailProvider(
    testConfig({ MAIL_PROVIDER: 'dashamail', DASHAMAIL_API_KEY: KEY }) as never,
  );

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(checkRecords).mockClear();
});

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [URL, RequestInit];
  return {
    url: String(url),
    init,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
    headers: init.headers as Record<string, string>,
  };
}

describe('выбор провайдера', () => {
  it('по умолчанию SMTP — в разработке письма уходят в Mailpit', () => {
    expect(createMailProvider(testConfig() as never)).toBeInstanceOf(SmtpProvider);
  });

  it('DashaMail — только явной настройкой', () => {
    const config = testConfig({ MAIL_PROVIDER: 'dashamail', DASHAMAIL_API_KEY: KEY });
    expect(createMailProvider(config as never)).toBeInstanceOf(DashaMailProvider);
  });
});

describe('тело запроса на отправку', () => {
  it('наш номер письма уходит как message_id — он вернётся в вебхуке', async () => {
    const payload = await sendPayload(message({ reference: REF }));
    expect(payload).toMatchObject({
      to: 'ivanov@example.ru',
      from_email: 'noreply@vruchay.ru',
      from_name: 'Федерация',
      subject: 'Ваш документ',
      message: '<p>Ваш документ во вложении.</p>',
      message_id: REF,
    });
  });

  it('служебное письмо получает номер с пометкой, а не пустой', async () => {
    const payload = await sendPayload(message());
    expect(String(payload.message_id)).toMatch(new RegExp(`^${SERVICE_REF_PREFIX}`));
  });

  it('отслеживание DashaMail выключено: открытия считает наш пиксель, ссылки не подменяются', async () => {
    const payload = await sendPayload(message());
    expect(payload).toMatchObject({ no_track_opens: 1, no_track_clicks: 1 });
  });

  it('обратный адрес, ссылка на письмо и отписка — заголовками, строкой JSON', async () => {
    const payload = await sendPayload(
      message({
        reference: REF,
        replyTo: 'org@example.ru',
        listUnsubscribeUrl: 'https://vruchay.ru/u/unsub',
      }),
    );
    expect(JSON.parse(String(payload.headers))).toEqual({
      'X-Vruchay-Ref': REF,
      'Reply-To': 'org@example.ru',
      'List-Unsubscribe': '<https://vruchay.ru/u/unsub>',
    });
  });

  it('перевод строки в заголовке не проходит — через него дописывают чужие заголовки', async () => {
    const payload = await sendPayload(message({ replyTo: 'a@b.ru\r\nBcc: x@y.ru' }));
    expect(JSON.parse(String(payload.headers))['Reply-To']).not.toMatch(/[\r\n]/);
  });

  it('без заголовков поля headers нет вовсе', async () => {
    const payload = await sendPayload(message());
    expect(payload.headers).toBeUndefined();
  });

  it('вложение — base64 из буфера и из потока хранилища', async () => {
    const payload = await sendPayload(
      message({
        attachments: [
          { filename: 'a.pdf', content: Buffer.from('буфер'), contentType: 'application/pdf' },
          {
            filename: 'b.pdf',
            content: Readable.from([Buffer.from('по'), Buffer.from('ток')]),
            contentType: 'application/pdf',
          },
        ],
      }),
    );
    const files = JSON.parse(String(payload.attachments));
    expect(files).toEqual([
      { name: 'a.pdf', filebody: Buffer.from('буфер').toString('base64') },
      { name: 'b.pdf', filebody: Buffer.from('поток').toString('base64') },
    ]);
  });

  it('адрес с запятой не уходит: DashaMail разослал бы его по нескольким', async () => {
    for (const to of ['a,b@example.ru', 'a@b.ru; c@d.ru', 'Имя <a@b.ru>', 'a @b.ru']) {
      await expect(sendPayload(message({ to }))).rejects.toBeInstanceOf(PermanentSendError);
    }
  });
});

describe('имя вложения', () => {
  it('без знаков препинания — DashaMail их в имени файла не принимает', () => {
    expect(attachmentName('Иванов И.И..pdf')).toBe('Иванов И И.pdf');
    expect(attachmentName('Грамота — 100% «победа».PDF')).toBe('Грамота 100 победа.pdf');
  });

  it('без имени — «Документ», расширение сохраняется', () => {
    expect(attachmentName('%%%.pdf')).toBe('Документ.pdf');
    expect(attachmentName('без расширения')).toBe('без расширения');
  });
});

describe('отправка', () => {
  it('ключ идёт заголовком, а не в адресе — адрес оседает в журналах', async () => {
    fetchMock.mockResolvedValue(ok({ transaction_id: REF }));
    await provider().send(message({ reference: REF }));

    const req = lastRequest();
    expect(req.url).toBe('https://api.dashamail.com/v2/transactional/messages');
    expect(req.url).not.toContain(KEY);
    expect(req.init.method).toBe('POST');
    expect(req.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(req.headers['Content-Type']).toBe('application/json');
  });

  it('возвращает номер письма из ответа', async () => {
    fetchMock.mockResolvedValue(ok({ transaction_id: REF }));
    await expect(provider().send(message({ reference: REF }))).resolves.toEqual({
      providerMessageId: REF,
    });
  });

  it('ответ без номера — не «отправлено»', async () => {
    fetchMock.mockResolvedValue(new Response('<html>шлюз</html>', { status: 200 }));
    await expect(provider().send(message())).rejects.toThrow(/без номера/);
  });

  it('неподтверждённый отправитель — отказ навсегда, с пояснением', async () => {
    fetchMock.mockResolvedValue(fail(422, 52, 'from_email is not confirmed'));
    const err = await provider()
      .send(message())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermanentSendError);
    expect((err as Error).message).toContain('адрес отправителя не подтверждён');
    expect((err as Error).message).toContain('код 52');
  });

  it('неверный ключ по старому API (200 и код в теле) — тоже навсегда', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            msg: { err_code: 1, text: 'Неверный логин и(или) пароль', type: 'error' },
            data: null,
          },
        }),
        { status: 200 },
      ),
    );
    await expect(provider().send(message())).rejects.toBeInstanceOf(PermanentSendError);
  });

  it('лимит запросов — повторяемо: очередь попробует позже', async () => {
    fetchMock.mockResolvedValue(fail(429, 58, 'Too many requests, limit 600/min'));
    const err = await provider()
      .send(message())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentSendError);
  });

  it('сеть легла — повторяемо, и ключа в тексте ошибки нет', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const err = (await provider()
      .send(message())
      .catch((e: unknown) => e)) as Error;
    expect(err).not.toBeInstanceOf(PermanentSendError);
    expect(err.message).toMatch(/не ответил/);
    expect(err.message).not.toContain(KEY);
  });
});

describe('разбор отказа', () => {
  it('v2: честный статус и error.code', () => {
    const r = refusalOf(402, { error: { code: 35, message: 'Недостаточно средств' } });
    expect(r).toMatchObject({ status: 402, code: 35, retryable: false });
  });

  it('сбой на их стороне — повторяемо, битые вложения и заголовки — нет', () => {
    expect(refusalOf(500, { error: { code: 36, message: 'send error' } })?.retryable).toBe(true);
    expect(refusalOf(500, { error: { code: 33, message: 'bad attachment' } })?.retryable).toBe(
      false,
    );
  });

  it('401 без кода из таблицы всё равно навсегда', () => {
    expect(refusalOf(401, { error: { code: 401, message: 'Unauthorized' } })?.retryable).toBe(
      false,
    );
  });

  it('успех — не отказ', () => {
    expect(refusalOf(201, { response: { msg: { err_code: 0 }, data: {} } })).toBeNull();
  });

  it('непонятное тело с ошибочным статусом — отказ по статусу', () => {
    expect(refusalOf(503, undefined)).toMatchObject({ status: 503, code: 503, retryable: true });
  });
});

describe('записи DNS из ответа DashaMail', () => {
  it('SPF и DKIM с короткими именами; CNAME статистики не нужен', () => {
    const records = issuedRecords({ response: { data: DOMAIN_RECORDS } }, 'example.ru');
    expect(records.map(({ type, host, value }) => ({ type, host, value }))).toEqual([
      { type: 'TXT', host: '@', value: 'v=spf1 include:_spf.dashasender.ru ~all' },
      { type: 'TXT', host: 'dm2._domainkey', value: 'v=DKIM1;p=MIIBIjANBgkq;t=s' },
    ]);
  });

  it('записи чужого домена из общего списка не берёт', () => {
    const records = issuedRecords(
      {
        response: {
          data: [{ record_type: 'TXT', name: 'other.ru.', value: 'v=spf1 ~all', valid: 1 }],
        },
      },
      'example.ru',
    );
    expect(records).toEqual([]);
  });

  it('читает отметку «прописано» в любом написании', () => {
    const records = issuedRecords(
      {
        response: {
          data: DOMAIN_RECORDS.map((r, i) => ({ ...r, valid: [1, '1', true][i] })),
        },
      },
      'example.ru',
    );
    expect(records.every((r) => r.valid)).toBe(true);
  });
});

describe('подключение домена организации', () => {
  it('записи: наше подтверждение, SPF и DKIM от DashaMail, DMARC', async () => {
    fetchMock.mockResolvedValue(ok(DOMAIN_RECORDS));
    const records = await provider().getDomainSetup('example.ru', 'token-1');

    expect(lastRequest().body).toEqual({ domain: 'example.ru' });
    expect(records.map((r) => r.host)).toEqual([
      '_vruchay-verify',
      '@',
      'dm2._domainkey',
      '_dmarc',
    ]);
    expect(records[0].value).toBe('vruchay-verify=token-1');
  });

  it('домен уже в нашем аккаунте — записи берутся проверкой', async () => {
    fetchMock
      .mockResolvedValueOnce(fail(409, 56, 'Domain already exists'))
      .mockResolvedValueOnce(ok(DOMAIN_RECORDS, 200));
    const records = await provider().getDomainSetup('example.ru', 'token-1');

    expect(lastRequest().url).toBe(
      'https://api.dashamail.com/v2/account/domains/check?domain=example.ru',
    );
    expect(records.some((r) => r.host === 'dm2._domainkey')).toBe(true);
  });

  it('домен в чужом аккаунте DashaMail — понятный отказ, а не пятисотая', async () => {
    fetchMock
      .mockResolvedValueOnce(fail(409, 56, 'Domain already exists'))
      .mockResolvedValueOnce(ok([], 200));
    await expect(provider().getDomainSetup('example.ru', 't')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('DashaMail недоступен — заявка не создаётся', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(provider().getDomainSetup('example.ru', 't')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('ответ без ключа DKIM — не выдаём домен, с которого не уйдёт ни одно письмо', async () => {
    fetchMock.mockResolvedValue(ok([DOMAIN_RECORDS[0]]));
    await expect(provider().getDomainSetup('example.ru', 't')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('проверка домена', () => {
  const records = [{ type: 'TXT' as const, host: '@', value: 'v=spf1', purpose: '' }];

  it('пока DNS не видим мы сами, DashaMail не спрашиваем', async () => {
    vi.mocked(checkRecords).mockResolvedValueOnce('pending');
    await expect(provider().checkDomain('example.ru', records)).resolves.toBe('pending');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('видим мы, но не видит DashaMail — ещё ожидает', async () => {
    fetchMock.mockResolvedValue(ok(DOMAIN_RECORDS, 200));
    await expect(provider().checkDomain('example.ru', records)).resolves.toBe('pending');
  });

  it('видят оба — подтверждён', async () => {
    fetchMock.mockResolvedValue(
      ok(
        DOMAIN_RECORDS.map((r) => ({ ...r, valid: 1 })),
        200,
      ),
    );
    await expect(provider().checkDomain('example.ru', records)).resolves.toBe('verified');
  });

  it('DashaMail не ответил — не подтверждаем наугад', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(provider().checkDomain('example.ru', records)).resolves.toBe('pending');
  });
});

describe('уведомления DashaMail', () => {
  it('наш номер в message_id находит письмо точно', () => {
    const events = provider().parseWebhook({
      event: 'delivered',
      email: 'ivanov@example.ru',
      message_id: REF,
      event_time: '2026-09-19 12:00:00',
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ reference: REF, type: 'delivered' });
  });

  it('событие служебного письма отбрасывается, а не ищется по адресу', () => {
    expect(
      provider().parseWebhook({
        event: 'bounced',
        email: 'ivanov@example.ru',
        message_id: `${SERVICE_REF_PREFIX}${REF}`,
      }),
    ).toEqual([]);
  });
});
