import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import type { GlobalSetupContext } from 'vitest/node';

/**
 * Своя схема в настоящей базе на каждый прогон.
 *
 * Не «почистим за собой таблицы», а именно своя схема: тесты этого слоя
 * заводят организации, задания и файлы, и наследовать чужие данные им
 * нельзя — ни от прошлого прогона, ни от рабочей базы разработчика.
 * Схема создаётся пустой, миграции накатываются с нуля, в конце схема
 * уходит целиком.
 *
 * Миграции накатываются тем же `prisma migrate deploy`, что и на боевом
 * сервере. Смысл слоя в этом и есть: если порядок миграций разъехался,
 * узнать об этом должен конвейер, а не человек на выкате.
 */

const DEFAULT_DATABASE_URL = 'postgresql://gramota:gramota@localhost:5432/gramota';
/** Пятнадцатая база Redis — расходная: перед прогоном она стирается целиком. */
const DEFAULT_REDIS_URL = 'redis://localhost:6379/15';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '../..');

export default async function setup({ provide }: GlobalSetupContext) {
  const base =
    process.env.INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const redisUrl = process.env.INTEGRATION_REDIS_URL ?? DEFAULT_REDIS_URL;
  const schema = `it_${randomBytes(6).toString('hex')}`;
  const databaseUrl = withSchema(base, schema);

  await dropSchema(base, schema);
  migrate(databaseUrl);
  await flushRedis(redisUrl);

  provide('databaseUrl', databaseUrl);
  provide('redisUrl', redisUrl);

  return async () => {
    await dropSchema(base, schema);
  };
}

/** Адрес базы со своей схемой. Прочие параметры строки сохраняем. */
function withSchema(base: string, schema: string): string {
  const url = new URL(base);
  url.searchParams.set('schema', schema);
  return url.toString();
}

function migrate(databaseUrl: string): void {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}

/**
 * Схема уходит целиком вместе со всем, что в ней успели завести.
 *
 * `$executeRawUnsafe`, потому что имя схемы в DDL параметром не передаётся.
 * Значение при этом не приходит ниоткуда снаружи — оно собрано здесь же
 * из случайных байтов, — и проверка ниже не даёт этому измениться
 * незаметно при следующей правке.
 */
async function dropSchema(base: string, schema: string): Promise<void> {
  if (!/^it_[0-9a-f]{12}$/.test(schema)) {
    throw new Error(`Имя схемы для тестов собрано не по правилу: ${schema}`);
  }
  const prisma = new PrismaClient({ datasourceUrl: base });
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Очередь тоже начинает с чистого листа.
 *
 * Часть прошлого прогона, оставшаяся в Redis, дошла бы до воркера этого —
 * и он бы честно попытался напечатать документы по строкам, которых
 * в базе больше нет.
 */
async function flushRedis(redisUrl: string): Promise<void> {
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}
