import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnv } from './config/env';

/**
 * Точка входа воркера: то же приложение, но без HTTP-сервера.
 *
 * Отдельный процесс нужен из-за Chromium: он самый прожорливый по памяти
 * компонент системы, и при пиковой генерации способен утянуть за собой соседей.
 * В отдельном контейнере ему выставляется жёсткий лимит памяти, и его перезапуск
 * не роняет API — пользователь продолжает работать с редактором, пока
 * генерация восстанавливается.
 */
async function bootstrap() {
  validateEnv(process.env);
  const logger = new Logger('Worker');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();

  logger.log('Воркер запущен: обработка генерации и рассылки');

  // Держим процесс живым: очереди работают на подписках, своего цикла у них нет.
  await new Promise<void>((resolve) => {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        logger.log(`Получен ${signal}, завершаем текущие задания`);
        void app.close().then(resolve);
      });
    }
  });
}

void bootstrap();
