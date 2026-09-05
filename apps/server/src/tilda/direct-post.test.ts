import { describe, expect, it, vi } from 'vitest';
import { TildaService, type SubmitContext } from './tilda.service';
import { submitSchema } from './tilda.dto';

/*
 * Приём формы прямо на наш адрес.
 *
 * У этого пути нет заголовка источника, а значит нет и белого списка
 * доменов — главной защиты обычной формы. Токен интеграции при этом
 * лежит открытым текстом в разметке страницы. Здесь проверяется, что
 * взамен требуется другая проверка участника и что старый путь от этого
 * не ослаб.
 */

interface Options {
  authMode?: 'none' | 'email_code';
  checkList?: boolean;
  requireAccount?: boolean;
  /** Адреса, лежащие в реестре получателей документа. */
  list?: string[];
  /** Есть ли у документа колонка с адресом. */
  emailColumn?: string | null;
}

const TOKEN = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';

function service(options: Options = {}) {
  const {
    authMode = 'none',
    checkList = false,
    requireAccount = false,
    list = [],
    emailColumn = 'email',
  } = options;

  const enqueue = vi.fn();
  const sendCode = vi.fn();
  const sendConfirmLink = vi.fn();

  const prisma = {
    tildaIntegration: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'integration-1',
        orgId: 'org-1',
        token: TOKEN,
        active: true,
        allowedDomains: ['sca-swimming.com'],
        documentIds: [DOCUMENT],
        authMode,
        checkList,
        requireAccount,
        singleFilePerEmail: false,
        dailyLimit: 500,
      }),
    },
    document: { findFirst: vi.fn().mockResolvedValue({ id: DOCUMENT }) },
    tildaRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'request-1' }),
    },
    consent: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    recipientColumn: {
      findMany: vi.fn().mockResolvedValue(emailColumn ? [{ name: emailColumn }] : []),
    },
    // Тегированный шаблон: значения приходят вторым и далее аргументами.
    $queryRaw: vi.fn((_strings: TemplateStringsArray, ...values: unknown[]) => {
      const wanted = values.slice(1).map((v) => String(v).toLowerCase());
      return Promise.resolve(wanted.some((w) => list.includes(w)) ? [{ id: 'row-1' }] : []);
    }),
  };

  const tilda = new TildaService(
    prisma as never,
    {
      issue: vi.fn((_id: string, o?: { long?: boolean }) =>
        Promise.resolve(o?.long ? 'a'.repeat(32) : '123456'),
      ),
    } as never,
    { sendCode, sendConfirmLink } as never,
    {} as never,
    { enqueue } as never,
    // Публичный адрес сервиса: из него собирается ссылка подтверждения.
    { get: () => 'https://vruchay.test' } as never,
  );

  return { tilda, enqueue, sendCode, sendConfirmLink };
}

function dto(extra: Record<string, unknown> = {}) {
  return submitSchema.parse({
    token: TOKEN,
    documentId: DOCUMENT,
    email: 'anna@example.ru',
    consent: true,
    ...extra,
  });
}

/** Прямая отправка: заголовков источника нет. */
const DIRECT: SubmitContext = { directPost: true, ip: '203.0.113.7' };
/** Обычная отправка нашим скриптом: источник есть всегда. */
const VIA_SCRIPT: SubmitContext = { origin: 'https://sca-swimming.com', ip: '203.0.113.7' };

describe('прямая отправка формы', () => {
  it('отклоняется, когда участника нечем проверить', async () => {
    // Ни кода на почту, ни списка: белого списка доменов тут нет,
    // а токен виден в разметке страницы — выдавали бы кому угодно.
    const { tilda, enqueue } = service({ authMode: 'none', checkList: false });

    await expect(tilda.submit(dto(), DIRECT)).rejects.toThrow(/настроена неверно/);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('принимается с подтверждением — но ссылкой, а не кодом', async () => {
    // Окно для кода рисует наш скрипт, а при прямой отправке его на
    // странице нет. Код ушёл бы в никуда.
    const { tilda, sendCode, sendConfirmLink } = service({ authMode: 'email_code' });

    await expect(tilda.submit(dto(), DIRECT)).resolves.toMatchObject({ status: 'need_code' });
    expect(sendCode).not.toHaveBeenCalled();
    expect(sendConfirmLink).toHaveBeenCalledWith(
      'org-1',
      'anna@example.ru',
      expect.stringMatching(/\/api\/v1\/tilda\/confirm\/request-1\/[A-Za-z0-9_-]{32}$/),
    );
  });

  it('через скрипт по-прежнему шлёт код, а не ссылку', async () => {
    const { tilda, sendCode, sendConfirmLink } = service({ authMode: 'email_code' });

    await expect(tilda.submit(dto(), VIA_SCRIPT)).resolves.toMatchObject({ status: 'need_code' });
    expect(sendCode).toHaveBeenCalled();
    expect(sendConfirmLink).not.toHaveBeenCalled();
  });

  it('принимается без кода, когда адрес есть в списке участников', async () => {
    const { tilda, enqueue } = service({
      authMode: 'none',
      checkList: true,
      list: ['anna@example.ru'],
    });

    await expect(tilda.submit(dto(), DIRECT)).resolves.toMatchObject({ status: 'processing' });
    expect(enqueue).toHaveBeenCalledWith('request-1');
  });

  it('чужой источник отклоняется и при прямой отправке', async () => {
    // Заголовок есть — значит проверяем его, отметка directPost тут не индульгенция.
    const { tilda } = service({ authMode: 'email_code' });

    await expect(
      tilda.submit(dto(), { ...DIRECT, origin: 'https://evil-sca-swimming.com' }),
    ).rejects.toThrow();
  });

  it('обычная отправка без источника по-прежнему отклоняется', async () => {
    // Регресс: смягчение сделано только для нового пути.
    const { tilda } = service({ authMode: 'email_code' });

    await expect(tilda.submit(dto(), { ip: '203.0.113.7' })).rejects.toThrow();
  });
});

describe('сверка со списком участников', () => {
  it('отклоняет адрес, которого нет в реестре', async () => {
    const { tilda, enqueue } = service({ checkList: true, list: ['drugoy@example.ru'] });

    await expect(tilda.submit(dto(), VIA_SCRIPT)).rejects.toThrow(/нет в списке участников/);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('сверяет и адрес учётной записи, а не только адрес доставки', async () => {
    // В реестре у организатора рабочий адрес, а прислать человек просит
    // на личный. Отказывать за это нельзя.
    const { tilda } = service({ checkList: true, list: ['rabochiy@example.ru'] });

    await expect(
      tilda.submit(dto({ email: 'lichniy@example.ru', accountEmail: 'rabochiy@example.ru' }), VIA_SCRIPT),
    ).resolves.toMatchObject({ status: 'processing' });
  });

  it('отклоняет всех, если у документа нет колонки с адресом', async () => {
    // Сверять не с чем. Пропустить всех — значит тихо выключить проверку,
    // которую организатор считает включённой.
    const { tilda } = service({ checkList: true, emailColumn: null });

    await expect(tilda.submit(dto(), VIA_SCRIPT)).rejects.toThrow(/нет в списке участников/);
  });

  it('не мешает, когда выключена', async () => {
    const { tilda } = service({ checkList: false, list: [] });

    await expect(tilda.submit(dto(), VIA_SCRIPT)).resolves.toMatchObject({ status: 'processing' });
  });
});

describe('приём только из личного кабинета', () => {
  it('отклоняет заявку без адреса учётной записи', async () => {
    const { tilda } = service({ requireAccount: true });

    await expect(tilda.submit(dto(), VIA_SCRIPT)).rejects.toThrow(/Войдите в личный кабинет/);
  });

  it('пропускает заявку, когда кабинет сообщил адрес', async () => {
    const { tilda } = service({ requireAccount: true });

    await expect(
      tilda.submit(dto({ accountEmail: 'anna@example.ru' }), VIA_SCRIPT),
    ).resolves.toMatchObject({ status: 'processing' });
  });
});
