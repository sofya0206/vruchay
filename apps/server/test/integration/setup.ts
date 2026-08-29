import { randomBytes } from 'node:crypto';
import { inject } from 'vitest';

/**
 * Окружение прогона. Ставится до того, как любой тест соберёт приложение:
 * ConfigModule читает `process.env` один раз при сборке модуля.
 *
 * Секреты не записаны в файл, а собираются из случайных байтов при каждом
 * запуске. Ни одно из этих значений никуда не уходит — база и очередь
 * свои, хранилище подменено, — но постоянная строка в репозитории рано
 * или поздно уезжает туда, где она уже настоящая.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = inject('databaseUrl');
process.env.REDIS_URL = inject('redisUrl');

process.env.SESSION_SECRET = randomBytes(32).toString('hex');
process.env.S3_ENDPOINT = 'http://localhost:9';
process.env.S3_ACCESS_KEY = randomBytes(8).toString('hex');
process.env.S3_SECRET_KEY = randomBytes(16).toString('hex');
process.env.S3_BUCKET = 'integration';
process.env.PUBLIC_URL = 'http://localhost:5173';

/** Резервных копий в тестах нет — сторож не должен их искать. */
process.env.BACKUP_S3_BUCKET = '';
