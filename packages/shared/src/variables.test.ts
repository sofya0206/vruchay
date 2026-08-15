import { describe, expect, it } from 'vitest';
import { mergeVariables, systemVariables } from './variables';

/*
 * Ошибка здесь печатается на бумаге и рассылается участникам. Пустое место
 * вместо даты или чужой номер обнаружить постфактум нечем — файл уже у людей.
 */

const AUG_4 = new Date('2026-08-04T21:30:00Z');

describe('служебные переменные', () => {
  it('дата в привычном виде', () => {
    expect(systemVariables({ issuedAt: AUG_4 }).date).toBe('05.08.2026');
  });

  it('дата считается по московскому времени, а не по часам сервера', () => {
    // 21:30 UTC — это уже 5 августа в Москве. Организация в России
    // ожидает московскую дату, где бы ни стоял сервер.
    const late = new Date('2026-08-04T21:30:00Z');
    expect(systemVariables({ issuedAt: late }).date).toBe('05.08.2026');

    const early = new Date('2026-08-04T05:00:00Z');
    expect(systemVariables({ issuedAt: early }).date).toBe('04.08.2026');
  });

  it('год берётся из той же даты', () => {
    const v = systemVariables({ issuedAt: AUG_4 });
    expect(v.year).toBe('2026');
    expect(v.date.endsWith(v.year)).toBe(true);
  });

  it('номер, код и организация подставляются как есть', () => {
    const v = systemVariables({
      issuedAt: AUG_4,
      number: 7,
      publicId: 'abc-123',
      orgName: 'Федерация плавания',
    });
    expect(v.number).toBe('7');
    expect(v.code).toBe('abc-123');
    expect(v.org).toBe('Федерация плавания');
  });

  it('неизвестное даёт пустую строку, а не «undefined» на грамоте', () => {
    const v = systemVariables({ issuedAt: AUG_4 });
    expect(v.number).toBe('');
    expect(v.code).toBe('');
    expect(v.org).toBe('');
  });
});

describe('соединение с колонками получателя', () => {
  it('колонки получателя доступны наравне со служебными', () => {
    const merged = mergeVariables({ name: 'Иванов Пётр' }, { issuedAt: AUG_4 });
    expect(merged.name).toBe('Иванов Пётр');
    expect(merged.date).toBe('05.08.2026');
  });

  it('своя колонка перекрывает служебную переменную того же имени', () => {
    // Организатор завёл колонку «date» и заполнил руками — значит имел
    // в виду именно её. Подменять его данные нашими нельзя.
    const merged = mergeVariables({ date: '17 июня 2026' }, { issuedAt: AUG_4 });
    expect(merged.date).toBe('17 июня 2026');
  });
});
