import { describe, expect, it } from 'vitest';
import { maskVerifyFields } from './name-mask';

const fields = {
  name: 'Иванов Пётр Ильич',
  club: 'Дельфин',
  place: '1',
  email: 'ivanov@example.ru',
};

describe('что показывать о получателе на странице проверки', () => {
  it('полностью — как отметил материал, но почту не отдаёт никогда', () => {
    expect(maskVerifyFields(fields, 'full')).toEqual({
      name: 'Иванов Пётр Ильич',
      club: 'Дельфин',
      place: '1',
    });
  });

  it('инициалами — имя сворачивается, остальное остаётся', () => {
    const masked = maskVerifyFields(fields, 'initials');
    // Сокращение ставит неразрывные пробелы, чтобы инициалы не переносились;
    // для сравнения приводим их к обычным.
    expect(masked.name.replace(/\u00a0/g, ' ')).toBe('Иванов П. И.');
    expect(masked.club).toBe('Дельфин');
    expect(masked.place).toBe('1');
    expect(masked).not.toHaveProperty('email');
  });

  it('ничего — только факт подлинности', () => {
    expect(maskVerifyFields(fields, 'none')).toEqual({});
  });

  it('телефон и дата рождения не показываются ни в каком режиме', () => {
    const risky = { name: 'Иванов Пётр', phone: '+7 900 000-00-00', birth_date: '01.01.2000' };
    expect(maskVerifyFields(risky, 'full')).toEqual({ name: 'Иванов Пётр' });
  });
});
