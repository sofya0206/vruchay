import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET: 'bucket',
  SESSION_SECRET: 'x'.repeat(48),
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

  it('отклоняет слишком короткий секрет сессии', () => {
    expect(() => validateEnv({ ...valid, SESSION_SECRET: 'коротко' })).toThrow(/SESSION_SECRET/);
  });
});

/*
 * Настройки, которые раньше читались мимо схемы.
 *
 * Пределы отправки с общего домена брались прямо из окружения и в схеме
 * не значились вовсе: опечатка в имени переменной или нечисловое значение
 * давали NaN, а любое сравнение с NaN ложно — суточный предел молча
 * переставал работать, и узнать об этом было неоткуда.
 */
describe('пределы общего домена', () => {
  it('есть в схеме со значениями по умолчанию', () => {
    const env = validateEnv(valid);
    expect(env.SHARED_DOMAIN_DAILY_LIMIT).toBe(500);
    expect(env.SHARED_DOMAIN_BATCH_LIMIT).toBe(300);
  });

  it('нечисловое значение не даёт серверу стартовать и называет настройку', () => {
    expect(() => validateEnv({ ...valid, SHARED_DOMAIN_DAILY_LIMIT: 'пятьсот' })).toThrow(
      /SHARED_DOMAIN_DAILY_LIMIT/,
    );
    expect(() => validateEnv({ ...valid, SHARED_DOMAIN_BATCH_LIMIT: '30 писем' })).toThrow(
      /SHARED_DOMAIN_BATCH_LIMIT/,
    );
  });

  it('ноль и отрицательное тоже не проходят', () => {
    expect(() => validateEnv({ ...valid, SHARED_DOMAIN_BATCH_LIMIT: '0' })).toThrow(
      /SHARED_DOMAIN_BATCH_LIMIT/,
    );
    expect(() => validateEnv({ ...valid, ORG_ACTIVE_JOBS: '-1' })).toThrow(/ORG_ACTIVE_JOBS/);
  });
});

describe('кривое значение любой числовой настройки останавливает запуск', () => {
  const numeric = [
    'PORT',
    'FREE_DOCUMENT_LIMIT',
    'ORG_ACTIVE_JOBS',
    'PRINT_MERGE_LIMIT_FILES',
    'PRINT_MERGE_LIMIT_MB',
    'REFERRAL_QUALIFY_DOCUMENTS',
    'SHARED_DOMAIN_DAILY_LIMIT',
    'SHARED_DOMAIN_BATCH_LIMIT',
  ];

  it.each(numeric)('%s', (key) => {
    expect(() => validateEnv({ ...valid, [key]: 'не число' })).toThrow(new RegExp(key));
  });
});

/*
 * Пустое значение — это «не задано».
 *
 * В .env переменную выключают, стирая значение после знака равенства:
 * так написано и в образцах проекта («ORG_ACTIVE_JOBS=», «пусто — 3»).
 * Без этого правила пустая строка проходила бы в z.coerce.number() как ноль
 * и роняла запуск на настройке, которую человек как раз и выключил.
 */
describe('пустое значение', () => {
  it('означает значение по умолчанию, а не ноль', () => {
    const env = validateEnv({ ...valid, ORG_ACTIVE_JOBS: '', PRINT_MERGE_LIMIT_MB: '' });
    expect(env.ORG_ACTIVE_JOBS).toBe(3);
    expect(env.PRINT_MERGE_LIMIT_MB).toBe(150);
  });

  it('у строковой настройки тоже подставляет значение по умолчанию', () => {
    // SERVICE_MAIL_FROM= в .env.prod.example пустой: без этого правила
    // служебные письма уходили бы с адреса «» и никуда не доходили.
    expect(validateEnv({ ...valid, SERVICE_MAIL_FROM: '' }).SERVICE_MAIL_FROM).toBe(
      'Вручай <noreply@vruchay.ru>',
    );
  });

  it('но у доверия обратному прокси пустая строка — осознанный выбор', () => {
    // Пустой TRUST_PROXY выключает доверие X-Forwarded-For. Подставить сюда
    // значение по умолчанию значило бы включить доверие обратно.
    expect(validateEnv({ ...valid, TRUST_PROXY: '' }).TRUST_PROXY).toBe('');
  });
});
