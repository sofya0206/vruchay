import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET: 'bucket',
};

describe('validateEnv', () => {
  it('подставляет значения по умолчанию', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('приводит PORT из строки к числу', () => {
    expect(validateEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('падает с понятным сообщением при отсутствии обязательной переменной', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = valid;
    expect(() => validateEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });
});
