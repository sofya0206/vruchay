import { defineConfig } from 'vitest/config';

/**
 * Слой, который разговаривает с настоящей базой.
 *
 * Отдельным прогоном, а не вместе с остальными: ему нужны Postgres
 * и Redis, он поднимает Chromium и идёт минуты, а не секунды.
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.int.test.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/integration/setup.ts'],

    /*
     * Строго по одному файлу за раз и всё в одном процессе.
     *
     * Файлы делят схему в базе, очередь в Redis и один браузер: два
     * прогона разом мешали бы друг другу не в коде, а в общем состоянии,
     * и красный тест ничего не говорил бы о причине.
     */
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,

    // Настоящий выпуск идёт через очередь и через браузер: секунд
    // по умолчанию тут не хватает никому.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    teardownTimeout: 60_000,
  },
});
