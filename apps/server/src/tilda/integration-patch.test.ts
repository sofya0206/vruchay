import { describe, expect, it } from 'vitest';
import { integrationSchema, integrationPatchSchema } from './tilda.dto';

/*
 * Правка одной настройки не должна трогать остальные.
 *
 * Ловушка в Zod: `.partial()` делает поля необязательными, но значения
 * по умолчанию оставляет и подставляет вместо отсутствующих. Проверка
 * поймала это на живом сервисе — включение одного переключателя выключало
 * соседний, потому что до базы доезжал весь набор полей целиком.
 */

describe('схема правки настроек интеграции', () => {
  it('не добавляет полей, которых не было в запросе', () => {
    const patch = integrationPatchSchema.parse({ requireAccount: true });

    expect(patch).toEqual({ requireAccount: true });
  });

  it('именно этого не делает partial() — иначе проверка бессмысленна', () => {
    // Закрепляем поведение Zod, из-за которого схема правки вообще нужна.
    const naive = integrationSchema.partial().parse({ requireAccount: true });

    expect(naive.checkList).toBe(false);
    expect(naive.dailyLimit).toBe(500);
  });

  it('сохраняет проверки значений', () => {
    expect(() => integrationPatchSchema.parse({ dailyLimit: 0 })).toThrow();
    expect(() => integrationPatchSchema.parse({ name: '' })).toThrow();
    expect(() => integrationPatchSchema.parse({ allowedDomains: [] })).toThrow();
  });

  it('пропускает правку нескольких полей сразу', () => {
    const patch = integrationPatchSchema.parse({ active: false, dailyLimit: 50 });

    expect(patch).toEqual({ active: false, dailyLimit: 50 });
  });

  it('создание по-прежнему проставляет значения по умолчанию', () => {
    // Схема создания не пострадала: там значения по умолчанию нужны.
    const created = integrationSchema.parse({
      name: 'Семинар',
      allowedDomains: ['sca-swimming.com'],
      documentIds: ['22222222-2222-4222-8222-222222222222'],
    });

    expect(created.dailyLimit).toBe(500);
    expect(created.authMode).toBe('email_code');
    expect(created.checkList).toBe(false);
  });
});
