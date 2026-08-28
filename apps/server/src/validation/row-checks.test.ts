import { describe, expect, it } from 'vitest';
import {
  cyrillicInEmail,
  declensionFailed,
  groupDuplicates,
  isAllUppercase,
  isDateColumn,
  looksLikeDateColumn,
  looksLikeEmail,
  normalizeEmail,
  normalizeName,
  parseLooseDate,
  toTitleCase,
} from './row-checks';

/*
 * Проверки значений в списке получателей.
 *
 * Почти всё здесь — про то, как выглядят настоящие таблицы участников:
 * выгрузка из протокола прописными, «ё» то есть то нет, адрес набран
 * в русской раскладке. Придуманных случаев тут нет.
 */

describe('приведение ФИО', () => {
  it('тёзки с «ё» и без совпадают', () => {
    expect(normalizeName('Пётр Иванов')).toBe(normalizeName('Петр Иванов'));
  });

  it('регистр и лишние пробелы не разводят одного человека на двоих', () => {
    expect(normalizeName('  ИВАНОВ   ПЁТР ')).toBe(normalizeName('Иванов Пётр'));
  });

  it('разные люди остаются разными', () => {
    expect(normalizeName('Иванов Пётр')).not.toBe(normalizeName('Иванов Павел'));
  });
});

describe('кириллица в адресе почты', () => {
  it('находит подменную букву в правильном на вид адресе', () => {
    // «о» здесь русская: адрес выглядит безупречно и проходит любую
    // проверку формата, а ящика такого не существует.
    expect(cyrillicInEmail('ivanоv@mail.ru')).toEqual(['о']);
  });

  it('чистый латинский адрес не трогает', () => {
    expect(cyrillicInEmail('ivanov@mail.ru')).toEqual([]);
  });

  it('перечисляет каждую подменную букву по разу', () => {
    expect(cyrillicInEmail('ааbс@mail.ru').sort()).toEqual(['а', 'с']);
  });
});

describe('формат адреса', () => {
  it.each(['ivanov@mail.ru', 'p.ivanov+2026@sport-school.example.org'])('«%s» — адрес', (v) => {
    expect(looksLikeEmail(v)).toBe(true);
  });

  it.each(['', 'нет почты', 'ivanov', 'ivanov@', '@mail.ru', 'ivanov mail.ru'])(
    '«%s» — не адрес',
    (v) => {
      expect(looksLikeEmail(v)).toBe(false);
    },
  );

  it('регистр адреса не различаем — почтовые серверы тоже', () => {
    expect(normalizeEmail(' Ivanov@Mail.RU ')).toBe('ivanov@mail.ru');
  });
});

describe('ФИО прописными', () => {
  it.each(['ИВАНОВ ПЁТР ИЛЬИЧ', 'ПЕТРОВА М.С.'])('«%s» — прописными', (v) => {
    expect(isAllUppercase(v)).toBe(true);
  });

  it.each(['Иванов Пётр', 'иванов пётр', 'Ким', ''])('«%s» — не прописными', (v) => {
    expect(isAllUppercase(v)).toBe(false);
  });

  it('одна буква не повод придираться', () => {
    expect(isAllUppercase('О')).toBe(false);
  });

  it('цифры и знаки регистра не имеют и решения не меняют', () => {
    expect(isAllUppercase('2026')).toBe(false);
  });

  it('исправление поднимает каждую часть двойной фамилии', () => {
    expect(toTitleCase('РИМСКИЙ-КОРСАКОВ НИКОЛАЙ')).toBe('Римский-Корсаков Николай');
  });

  it('исправление приводит и лишние пробелы', () => {
    expect(toTitleCase('ИВАНОВ   ПЁТР')).toBe('Иванов Пётр');
  });
});

describe('разбор дат', () => {
  it.each([
    ['17.06.2026', 2026, 6, 17],
    ['17/06/2026', 2026, 6, 17],
    ['2026-06-17', 2026, 6, 17],
    ['17 июня 2026', 2026, 6, 17],
    ['17 июня 2026 г.', 2026, 6, 17],
    ['1 мая 2026 года', 2026, 5, 1],
    ['5 марта 2026', 2026, 3, 5],
  ])('«%s» разбирается', (value, year, month, day) => {
    const date = parseLooseDate(value as string);
    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(year);
    expect(date!.getUTCMonth() + 1).toBe(month);
    expect(date!.getUTCDate()).toBe(day);
  });

  it('двузначный год: 26 — это 2026, а 98 — это 1998', () => {
    expect(parseLooseDate('17.06.26')!.getUTCFullYear()).toBe(2026);
    expect(parseLooseDate('17.06.98')!.getUTCFullYear()).toBe(1998);
  });

  it.each(['31.02.2026', '17.13.2026', '00.06.2026', '32.01.2026'])(
    '«%s» — такой даты не существует',
    (v) => {
      expect(parseLooseDate(v)).toBeNull();
    },
  );

  it.each(['', 'весенняя сессия', '17–19 июня 2026', 'скоро', '2026'])(
    '«%s» — не дата',
    (v) => {
      expect(parseLooseDate(v)).toBeNull();
    },
  );

  it('колонка узнаётся по названию, которое подбирает импорт', () => {
    expect(looksLikeDateColumn('date')).toBe(true);
    expect(looksLikeDateColumn('date_2')).toBe(true);
    expect(looksLikeDateColumn('birth')).toBe(true);
    expect(looksLikeDateColumn('team')).toBe(false);
  });

  it('колонка считается датовой, если датами заполнено большинство', () => {
    expect(isDateColumn(['17.06.2026', '18.06.2026', '19.06.2026', 'нет'])).toBe(true);
  });

  it('колонка со свободным текстом датовой не считается', () => {
    // Иначе человек получил бы предупреждение на каждую строку списка.
    expect(isDateColumn(['весенняя сессия', 'осенняя сессия', 'зимняя', '17.06.2026'])).toBe(false);
  });

  it('на трёх значениях выводов не делаем', () => {
    expect(isDateColumn(['17.06.2026', '', ''])).toBe(false);
  });
});

describe('склонение', () => {
  it('обычное русское ФИО склоняется', () => {
    expect(declensionFailed('Иванов Пётр Ильич')).toBe(false);
  });

  it('латинское имя склонить нечем — и это надо показать человеку', () => {
    expect(declensionFailed('John Smith')).toBe(true);
  });

  it('пустое имя проблемой не считается: о нём скажет другая проверка', () => {
    expect(declensionFailed('')).toBe(false);
  });
});

describe('поиск повторов', () => {
  it('одиночки в результат не попадают', () => {
    const groups = groupDuplicates([{ v: 'а' }, { v: 'б' }], (x) => x.v);
    expect(groups.size).toBe(0);
  });

  it('повторы собираются в группу', () => {
    const groups = groupDuplicates([{ v: 'а' }, { v: 'б' }, { v: 'а' }], (x) => x.v);
    expect(groups.get('а')).toHaveLength(2);
  });

  it('пустой ключ повтором не считается', () => {
    // Иначе все строки без почты оказались бы «повторами» друг друга.
    const groups = groupDuplicates([{ v: '' }, { v: '' }], (x) => x.v || null);
    expect(groups.size).toBe(0);
  });
});
