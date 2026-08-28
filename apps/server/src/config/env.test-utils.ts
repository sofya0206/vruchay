import { validateEnv, type Env } from './env';

/**
 * Проверенные настройки для тестов служб.
 *
 * Службы читают настройки только через ConfigService, а тесты собирают их
 * вручную — значит, кто-то должен подставить сюда значения. Берём их из той же
 * схемы, что и боевой запуск: тест на службе, которая ждёт число, не должен
 * оказаться единственным местом, где это число написано ещё раз.
 */
const REQUIRED = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET: 'bucket',
  SESSION_SECRET: 'x'.repeat(48),
  PUBLIC_URL: 'https://vruchay.ru',
};

/**
 * Подделка ConfigService: тот же `get(key, { infer: true })`, что и у Nest.
 * Возвращаемый тип намеренно широкий — в тестах он подставляется через `never`.
 */
export function testConfig(over: Record<string, unknown> = {}) {
  const env: Env = validateEnv({ ...REQUIRED, ...over });
  return {
    get<K extends keyof Env>(key: K): Env[K] {
      return env[key];
    },
  };
}
