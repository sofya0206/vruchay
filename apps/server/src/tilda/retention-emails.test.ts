import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RetentionService } from './retention.service';
import { testConfig } from '../config/env.test-utils';

/*
 * Сроки хранения адресов в журнале писем.
 *
 * Механизм сроков хранения в сервисе есть и работает, но таблица писем
 * в уборку не входила — а в ней лежат адреса участников. Для сервиса,
 * который позиционируется под госучреждения и 152-ФЗ, бессрочное хранение
 * адресов — первый вопрос на проверке.
 *
 * Prisma подменяем заглушкой: проверяем не то, как база выполняет UPDATE,
 * а то, какой запрос ночная задача вообще отправляет — раньше она
 * не отправляла никакого.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

interface Call {
  where: { queuedAt?: { lt: Date }; NOT?: { toEmail: string } };
  data: { toEmail: string };
}

function serviceWith() {
  const emailUpdates: Call[] = [];
  const prisma = {
    tildaRequest: {
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
    },
    consent: { deleteMany: async () => ({ count: 0 }) },
    email: {
      updateMany: async (args: Call) => {
        emailUpdates.push(args);
        return { count: 2 };
      },
    },
  };
  const documents = { purgeExpired: async () => 0 };
  return {
    service: new RetentionService(prisma as never, testConfig() as never, documents as never),
    emailUpdates,
  };
}

describe('ночная уборка журнала писем', () => {
  it('обезличивает адреса участников по истечении срока', async () => {
    const { service, emailUpdates } = serviceWith();
    const result = await service.run();

    expect(emailUpdates).toHaveLength(1);
    expect(emailUpdates[0].data.toEmail).toBe('');
    expect(result.emails).toBe(2);
  });

  it('берёт письма старше года, а не все подряд', async () => {
    const { service, emailUpdates } = serviceWith();
    const before = Date.now();
    await service.run();
    const cutoff = emailUpdates[0].where.queuedAt!.lt.getTime();

    // Ровно год: месяц был бы вычищением рабочей истории, три года —
    // хранением адресов дольше, чем этого требует цель.
    const expected = before - 365 * DAY_MS;
    expect(Math.abs(cutoff - expected)).toBeLessThan(5_000);
  });

  it('уже обезличенные письма второй раз не трогает', async () => {
    // Иначе счётчик в журнале каждую ночь показывал бы одно и то же число,
    // а UPDATE переписывал бы всю таблицу.
    const { service, emailUpdates } = serviceWith();
    await service.run();
    expect(emailUpdates[0].where.NOT).toEqual({ toEmail: '' });
  });

  it('стирает адрес, но не сам факт отправки', async () => {
    const { service, emailUpdates } = serviceWith();
    await service.run();
    // Статус доставки, время и связь с файлом — это история выдачи
    // документа, а не персональные данные: организация по ней отвечает
    // на вопросы о своём награждении.
    expect(Object.keys(emailUpdates[0].data)).toEqual(['toEmail']);
  });
});

/*
 * Связи в базе. Проверяем схему, а не живую базу: тестов против настоящего
 * PostgreSQL в проекте пока нет (заведены отдельной задачей), а забытый
 * внешний ключ виден и здесь — и виден ровно там, где его забыли.
 */
describe('связи и индексы таблицы писем', () => {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const model = (name: string) =>
    schema.slice(schema.indexOf(`model ${name} {`), schema.indexOf('\n}', schema.indexOf(`model ${name} {`)));

  it('удаление материала забирает связанные письма', () => {
    expect(model('Email')).toMatch(
      /document\s+Document\?\s+@relation\(fields: \[documentId\][^)]*onDelete: Cascade\)/,
    );
  });

  it('удаление строки получателей письмо не забирает', () => {
    // Список получателей переливают заново при каждом импорте, а журнал
    // отправки за прошлое награждение от этого пропадать не должен.
    expect(model('Email')).toMatch(
      /row\s+RecipientRow\?\s+@relation\(fields: \[rowId\][^)]*onDelete: SetNull\)/,
    );
  });

  it('есть индекс под выборку писем по выданному файлу', () => {
    // Карточка документа в реестре ищет письма именно так.
    expect(model('Email')).toMatch(/@@index\(\[fileId\]\)/);
  });

  it('заявка с публичной формы связана с материалом', () => {
    expect(model('TildaRequest')).toMatch(
      /document\s+Document\s+@relation\(fields: \[documentId\][^)]*onDelete: Cascade\)/,
    );
  });

  it('счёт переживает удаление заявки, из которой вырос', () => {
    expect(model('Invoice')).toMatch(
      /lead\s+Lead\?\s+@relation\(fields: \[leadId\][^)]*onDelete: SetNull\)/,
    );
  });
});
