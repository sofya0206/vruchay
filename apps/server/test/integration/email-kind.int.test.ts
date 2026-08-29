import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/db';
import { makeDocument, makeOrg, makeRows } from './support/fixtures';
import { startApp, type IntegrationApp } from './support/app';

/**
 * Два потока писем на настоящих записях.
 *
 * Рекламный кусок внутри транзакционного письма делает рекламным всё
 * письмо целиком, а штраф по ст. 14.3 КоАП — от 300 тысяч до миллиона
 * рублей за каждый факт отправки. Поэтому поток — это поле `kind`
 * в базе и развилка в коде, а не строчка в инструкции оператору.
 *
 * Проверяем это на настоящих `email_templates` и `emails`: разделение
 * держится на запросе с фильтром по потоку и на уникальном индексе
 * по живым письмам, а ни то ни другое двойник подтвердить не может —
 * он их изображает.
 *
 * Почтовый воркер не поднят: письмо должно попасть в базу и остаться там.
 * Проверяется решение «слать или не слать», а не почтовый шлюз.
 */
describe('транзакционный и рекламный потоки не смешиваются', () => {
  let app: IntegrationApp;
  let orgId: string;
  let documentId: string;

  const people = [
    { name: 'Иванов Пётр Ильич', email: 'ivanov@example.ru' },
    { name: 'Соколова Мария Петровна', email: 'sokolova@example.ru' },
  ];

  const letter = {
    subject: 'Ваш документ',
    bodyHtml: '<p>Здравствуйте</p>',
    attachGeneratedFile: false,
  };

  beforeAll(async () => {
    app = await startApp({ worker: false });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase(app.prisma);
    const org = await makeOrg(app.prisma, { name: 'Федерация' });
    orgId = org.id;
    const document = await makeDocument(app.prisma, orgId);
    documentId = document.id;
    await makeRows(app.prisma, documentId, people);
  });

  async function saveTransactional() {
    return app.mailing.saveTemplate(orgId, documentId, { kind: 'transactional', ...letter });
  }

  async function saveMarketing() {
    return app.mailing.saveTemplate(orgId, documentId, {
      kind: 'marketing',
      ...letter,
      subject: 'Скидка на сезон',
      advertiserName: 'ООО «Ромашка»',
    });
  }

  it('у материала два разных шаблона, а не один переписанный', async () => {
    const transactional = await saveTransactional();
    const marketing = await saveMarketing();

    expect(transactional.id).not.toBe(marketing.id);

    const saved = await app.prisma.emailTemplate.findMany({
      where: { orgId, documentId },
      orderBy: { kind: 'asc' },
    });
    expect(saved.map((t) => t.kind)).toEqual(['transactional', 'marketing']);
    // Рекламодатель есть только у рекламного: транзакционному письму
    // рекламодатель не полагается по определению.
    expect(saved.find((t) => t.kind === 'transactional')?.advertiserName).toBeNull();
    expect(saved.find((t) => t.kind === 'marketing')?.advertiserName).toBe('ООО «Ромашка»');
    // Правка рекламного текста не тронула письмо о выдаче документа.
    expect(saved.find((t) => t.kind === 'transactional')?.subject).toBe('Ваш документ');
  });

  it('рекламное письмо без рекламодателя не сохраняется', async () => {
    await expect(
      app.mailing.saveTemplate(orgId, documentId, {
        kind: 'marketing',
        ...letter,
        advertiserName: '   ',
      }),
    ).rejects.toThrow('Укажите рекламодателя');

    expect(await app.prisma.emailTemplate.count({ where: { orgId, kind: 'marketing' } })).toBe(0);
  });

  it('рекламной рассылкой нельзя отправить письмо о выдаче документа', async () => {
    await saveTransactional();

    // Транзакционный шаблон есть, рекламного нет — и подставлять первый
    // вместо второго нельзя: это была бы реклама текстом выдачи, но
    // с рекламным низом и без согласия.
    await expect(
      app.mailing.send(orgId, { documentIds: [documentId], kind: 'marketing', source: 'table' }),
    ).rejects.toThrow('письмо не настроено');

    expect(await app.prisma.email.count({ where: { orgId } })).toBe(0);
  });

  it('письмом о выдаче документа нельзя отправить рекламный текст', async () => {
    await saveMarketing();

    await expect(
      app.mailing.send(orgId, {
        documentIds: [documentId],
        kind: 'transactional',
        source: 'table',
      }),
    ).rejects.toThrow('письмо не настроено');

    expect(await app.prisma.email.count({ where: { orgId } })).toBe(0);
  });

  it('поток письма записан в базу копией с шаблона', async () => {
    const transactional = await saveTransactional();
    const marketing = await saveMarketing();

    await app.mailing.send(orgId, {
      documentIds: [documentId],
      kind: 'transactional',
      source: 'table',
    });

    const sent = await app.prisma.email.findMany({ where: { orgId } });
    expect(sent).toHaveLength(people.length);
    expect(new Set(sent.map((e) => e.kind))).toEqual(new Set(['transactional']));
    // Шаблон именно транзакционный — рекламный не подмешался ни одному.
    expect(new Set(sent.map((e) => e.templateId))).toEqual(new Set([transactional.id]));
    expect(sent.map((e) => e.templateId)).not.toContain(marketing.id);
  });

  it('согласие на рекламу нужно, а на выдачу документа — нет', async () => {
    await saveTransactional();
    await saveMarketing();

    // Реклама уходит только тому, кто на неё согласился.
    await app.prisma.consent.create({
      data: {
        orgId,
        documentId,
        subjectEmail: people[0].email,
        purpose: 'marketing',
        granted: true,
        textVersion: 'form-v1',
      },
    });

    const marketing = await app.mailing.send(orgId, {
      documentIds: [documentId],
      kind: 'marketing',
      source: 'table',
    });
    expect(marketing.queued).toBe(1);
    expect(marketing.results[0].skipped.map((s) => s.email)).toEqual([people[1].email]);

    // Письмо о выдаче документа согласия не требует: это переписка
    // по существу отношений, а не реклама.
    const transactional = await app.mailing.send(orgId, {
      documentIds: [documentId],
      kind: 'transactional',
      source: 'table',
    });
    expect(transactional.queued).toBe(people.length);

    const byKind = await app.prisma.email.groupBy({
      by: ['kind'],
      where: { orgId },
      _count: { _all: true },
    });
    expect(Object.fromEntries(byKind.map((k) => [k.kind, k._count._all]))).toEqual({
      marketing: 1,
      transactional: 2,
    });
  });

  it('один живой адрес на поток: повтор не дублирует, чужой поток не мешает', async () => {
    await saveTransactional();
    await saveMarketing();
    await app.prisma.consent.create({
      data: {
        orgId,
        documentId,
        subjectEmail: people[0].email,
        purpose: 'marketing',
        granted: true,
        textVersion: 'form-v1',
      },
    });

    const first = await app.mailing.send(orgId, {
      documentIds: [documentId],
      kind: 'transactional',
      source: 'table',
    });
    expect(first.queued).toBe(2);

    // «Нажал ещё раз, не дождавшись»: второе письмо тому же адресу
    // в том же потоке не уходит — за это отвечает частичный уникальный
    // индекс emails_document_to_kind_live, которого у двойника нет.
    const again = await app.mailing.send(orgId, {
      documentIds: [documentId],
      kind: 'transactional',
      source: 'table',
    });
    expect(again.queued).toBe(0);

    // А рекламное письмо тому же адресу — это другое письмо и другой повод.
    const marketing = await app.mailing.send(orgId, {
      documentIds: [documentId],
      kind: 'marketing',
      source: 'table',
    });
    expect(marketing.queued).toBe(1);

    const forFirstPerson = await app.prisma.email.findMany({
      where: { orgId, toEmail: people[0].email },
      orderBy: { kind: 'asc' },
    });
    expect(forFirstPerson.map((e) => e.kind).sort()).toEqual(['marketing', 'transactional']);
  });
});
