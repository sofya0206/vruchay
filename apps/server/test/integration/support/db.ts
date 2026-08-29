import type { PrismaService } from '../../../src/prisma/prisma.service';

/**
 * Пустая база перед каждым файлом тестов.
 *
 * Схема у прогона своя, но файлы в ней идут один за другим, и наследовать
 * данные соседа они не должны: реестр на четыре тысячи строк из одного
 * теста менял бы счёт в другом.
 *
 * Список таблиц спрашиваем у самой базы, а не перечисляем руками: забытая
 * при следующей миграции таблица — это данные, которые молча переживут
 * уборку.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;

  // Имена приходят из самой базы и берутся в кавычки; параметром список
  // таблиц в TRUNCATE не передаётся.
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Ждём, пока условие станет истинным, — или честно падаем по времени. */
export async function waitFor<T>(
  what: string,
  check: () => Promise<T | null | undefined | false>,
  { timeoutMs = 60_000, intervalMs = 100 } = {},
): Promise<T> {
  const until = Date.now() + timeoutMs;
  let last: T | null | undefined | false = null;
  while (Date.now() < until) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Не дождались: ${what} (${timeoutMs} мс, последнее значение ${String(last)})`);
}
