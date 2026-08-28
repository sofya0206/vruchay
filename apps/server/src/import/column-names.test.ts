import { describe, expect, it } from 'vitest';
import {
  guessByValues,
  levenshtein,
  matchKnownField,
  refineColumns,
  suggestColumnName,
} from './column-names';

describe('levenshtein', () => {
  it('считает правки', () => {
    expect(levenshtein('место', 'место')).toBe(0);
    expect(levenshtein('мест', 'место')).toBe(1);
    expect(levenshtein('мсето', 'место')).toBe(2);
    expect(levenshtein('', 'дата')).toBe(4);
  });

  it('не считает дальше порога', () => {
    expect(levenshtein('фамилия', 'дата', 2)).toBeGreaterThan(2);
  });
});

describe('matchKnownField: точный словарь', () => {
  it('ловит подстроку раньше, чем считает расстояние', () => {
    // «Э-почта» распознаётся правилом по подстроке «почт», а не Левенштейном:
    // до нечёткого шага дело не доходит.
    expect(matchKnownField('Э-почта')).toBe('email');
    expect(matchKnownField('Электронная почта участника')).toBe('email');
    expect(matchKnownField('Номер')).toBe('number');
  });

  it('оставляет прежнее поведение на незнакомых заголовках', () => {
    expect(suggestColumnName('Примечание')).toBe('primechanie');
    expect(suggestColumnName('Весовая категория')).toBe('category');
    expect(suggestColumnName('!!!')).toBe('column');
  });
});

describe('matchKnownField: опечатки', () => {
  it('узнаёт заголовок с опечаткой, который не ловится подстрокой', () => {
    expect(matchKnownField('Фамиля')).toBe('surname');
    expect(matchKnownField('Отчетсво')).toBe('patronymic');
    expect(matchKnownField('Телфон')).toBe('phone');
    expect(matchKnownField('Резултат')).toBe('result');
    expect(matchKnownField('Учасник')).toBe('name');
    expect(matchKnownField('Поча')).toBe('email');
    expect(matchKnownField('Мест')).toBe('place');
    expect(matchKnownField('Даты')).toBe('date');
  });

  it('не путает короткие слова, отличающиеся на две правки', () => {
    // «Месяц» и «место» — пять букв и две правки. Раньше колонка месяца
    // молча становилась местом.
    expect(matchKnownField('Месяц')).toBeNull();
    expect(matchKnownField('Класс')).toBeNull();
    expect(matchKnownField('Группа')).toBeNull();
    expect(matchKnownField('Возраст')).toBeNull();
    expect(matchKnownField('Оценка')).toBeNull();
    expect(matchKnownField('Пол')).toBeNull();
  });

  it('расплачивается за строгость перестановками в коротких словах', () => {
    // «Мсето» — две правки от «места», и отличить это от другого слова
    // длиной в пять букв нечем. Осознанный размен в пользу «не угадать»
    // вместо «угадать неверно».
    expect(matchKnownField('Мсето')).toBeNull();
    expect(suggestColumnName('Месяц')).toBe('mesyac');
    expect(suggestColumnName('Класс')).toBe('klass');
  });

  it('не притягивает непохожие короткие слова', () => {
    expect(matchKnownField('Год')).toBeNull();
    expect(matchKnownField('Тема')).toBeNull();
    expect(matchKnownField('Вес')).toBeNull();
    expect(matchKnownField('Тур')).toBeNull();
    expect(matchKnownField('Балл')).toBeNull();
  });
});

describe('guessByValues', () => {
  it('видит почту', () => {
    expect(guessByValues(['ivanov@mail.ru', 'petr@yandex.ru'])).toBe('email');
  });

  it('видит ФИО по трём словам с заглавной буквы', () => {
    expect(guessByValues(['Иванов Иван Иванович', 'Пётр Сергеев Петрович'])).toBe('name');
    expect(guessByValues(['Иванов Иван'])).toBeNull();
  });

  it('видит места: числа подряд, без повторов, с единицей', () => {
    expect(guessByValues(['1', '2', '3', '10'])).toBe('place');
    expect(guessByValues(['3', '1', '2'])).toBe('place');
  });

  it('не принимает за места класс, группу, возраст и оценку', () => {
    expect(guessByValues(['5', '5', '6', '7'])).toBeNull(); // класс: повторы и нет единицы
    expect(guessByValues(['1', '2', '1', '2'])).toBeNull(); // группа: повторы
    expect(guessByValues(['10', '11', '12', '11'])).toBeNull(); // возраст
    expect(guessByValues(['4', '5', '3'])).toBeNull(); // оценка: нет единицы
    expect(guessByValues(['2024', '2025'])).toBeNull();
  });

  it('молчит на пустой и разнородной колонке', () => {
    expect(guessByValues(['', '  '])).toBeNull();
    expect(guessByValues(['да', '17', 'ivanov@mail.ru'])).toBeNull();
  });
});

describe('refineColumns', () => {
  it('уточняет нераспознанные колонки по значениям и помечает догадку', () => {
    const columns = refineColumns(
      [
        { source: 'Столбец1', suggested: 'stolbec1' },
        { source: 'Столбец2', suggested: 'stolbec2' },
        { source: 'Столбец3', suggested: 'stolbec3' },
      ],
      [
        ['Иванов Иван Иванович', 'ivanov@mail.ru', '1'],
        ['Петров Пётр Петрович', 'petr@yandex.ru', '2'],
      ],
    );

    expect(columns.map((c) => c.suggested)).toEqual(['name', 'email', 'place']);
    expect(columns.every((c) => c.guessed)).toBe(true);
  });

  it('не спорит с распознанным заголовком', () => {
    const columns = refineColumns(
      [{ source: 'Место', suggested: 'place' }],
      [['ivanov@mail.ru'], ['petr@yandex.ru']],
    );

    expect(columns[0].suggested).toBe('place');
    expect(columns[0].guessed).toBe(false);
  });

  it('не переименовывает колонку «Класс» в место', () => {
    const columns = refineColumns(
      [{ source: 'Класс', suggested: 'klass' }],
      [['5'], ['6'], ['7'], ['5']],
    );

    expect(columns[0].suggested).toBe('klass');
    expect(columns[0].guessed).toBe(false);
  });

  it('не создаёт повтор имени', () => {
    const columns = refineColumns(
      [
        { source: 'Электронная почта', suggested: 'email' },
        { source: 'Запасной адрес', suggested: 'zapasnoy_adres' },
      ],
      [['a@mail.ru', 'b@mail.ru']],
    );

    expect(columns[1].suggested).toBe('zapasnoy_adres');
    expect(columns[1].guessed).toBe(false);
  });
});
