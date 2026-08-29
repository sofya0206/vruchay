import { defaultExclude, defineConfig } from 'vitest/config';

/**
 * Обычный прогон: только быстрые тесты, без базы и без браузера-робота.
 *
 * Конфига здесь раньше не было — всё работало на умолчаниях, и это
 * по-прежнему так. Единственное отличие: каталог `test/integration`
 * из обычного прогона исключён. Ему нужен живой Postgres, и запускается
 * он отдельно — `pnpm test:integration`. Если бы он попадал сюда,
 * `pnpm test` перестал бы работать на машине без поднятой базы, и им
 * перестали бы пользоваться.
 */
export default defineConfig({
  test: {
    exclude: [...defaultExclude, 'test/integration/**'],
  },
});
