import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeFullName, parseProtocol, protocolColumnName } from './protocol';
import type { ParsedProtocol } from './protocol';

/*
 * По тесту на каждый синтетический протокол из docs/fixtures/protocols.
 * Один тест на файл, а не один общий: когда парсер сломается, должно быть
 * видно, на какой именно особенности он сломался, — иначе разбираться
 * придётся с нуля каждый раз.
 *
 * Файлы делает apps/server/scripts/make-protocol-fixtures.ts. Правка
 * ожиданий вместо правки парсера здесь запрещена так же, как и везде:
 * фикстуры описывают, как выглядят настоящие протоколы.
 */

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../docs/fixtures/protocols',
);

async function load(file: string): Promise<ParsedProtocol> {
  return parseProtocol(await readFile(path.join(FIXTURES, file)));
}

/** Значения строки по именам колонок — так читать ожидания понятнее. */
function asObjects(parsed: ParsedProtocol): Record<string, string>[] {
  return parsed.rows.map((row) =>
    Object.fromEntries(parsed.columns.map((c, i) => [c.suggested, row[i] ?? ''])),
  );
}

function column(parsed: ParsedProtocol, name: string): string[] {
  const index = parsed.columns.findIndex((c) => c.suggested === name);
  expect(index, `колонка «${name}» не найдена`).toBeGreaterThanOrEqual(0);
  return parsed.rows.map((row) => row[index] ?? '');
}

describe('01-простой.xlsx — опорный случай', () => {
  it('читает шапку в первой строке и все строки данных', async () => {
    const parsed = await load('01-простой.xlsx');

    expect(parsed.headerRowIndex).toBe(0);
    expect(parsed.headerRowCount).toBe(1);
    expect(parsed.columns.map((c) => c.suggested)).toEqual([
      'number',
      'name',
      'birth_year',
      'team',
      'place',
      'result',
    ]);
    expect(parsed.rows).toHaveLength(6);
    expect(asObjects(parsed)[0]).toEqual({
      number: '1',
      name: 'Иванов Иван',
      birth_year: '2008',
      team: 'СШОР № 1',
      place: '1',
      result: '1:02,45',
    });
    expect(parsed.groups).toEqual([]);
  });

  it('предупреждает, что групп нет и место считается по всему файлу', async () => {
    const parsed = await load('01-простой.xlsx');
    expect(parsed.warnings.join(' ')).toMatch(/групп в файле не нашлось/);
    expect(parsed.warnings.join(' ')).toMatch(/Места берутся как написаны/);
  });
});

describe('02-шапка-ниже.xlsx — шапка не в первой строке', () => {
  it('пропускает название протокола и находит настоящую шапку', async () => {
    const parsed = await load('02-шапка-ниже.xlsx');

    expect(parsed.headerRowIndex).toBe(4);
    expect(parsed.columns.map((c) => c.source)).toEqual([
      '№',
      'Фамилия, имя',
      'Год рождения',
      'Команда',
      'Место',
      'Результат',
    ]);
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.warnings.join(' ')).toMatch(/Шапка найдена в строке 5/);
  });

  it('не принимает объединённую плашку названия за шапку', async () => {
    const parsed = await load('02-шапка-ниже.xlsx');
    // Название растянуто на шесть колонок и после чтения выглядит как шесть
    // одинаковых заголовков — самая правдоподобная ловушка в этом файле.
    expect(parsed.columns.some((c) => c.source.includes('ПРОТОКОЛ'))).toBe(false);
    expect(parsed.groups).toEqual([]);
  });
});

describe('03-двухуровневая-шапка.xlsx — шапка в два уровня', () => {
  it('склеивает уровни и берёт имя переменной из нижнего', async () => {
    const parsed = await load('03-двухуровневая-шапка.xlsx');

    expect(parsed.headerRowCount).toBe(2);
    expect(parsed.columns).toEqual([
      { source: '№', suggested: 'number' },
      { source: 'Участник · Фамилия, имя', suggested: 'name' },
      { source: 'Участник · Г.р.', suggested: 'birth_year' },
      { source: 'Команда', suggested: 'team' },
      { source: 'Результат · Время', suggested: 'result' },
      { source: 'Результат · Очки', suggested: 'points' },
      { source: 'Место', suggested: 'place' },
    ]);
  });

  it('не теряет ни одной строки данных под двухуровневой шапкой', async () => {
    const parsed = await load('03-двухуровневая-шапка.xlsx');
    expect(column(parsed, 'name')).toEqual(['Волков Степан', 'Морозов Кирилл', 'Лебедев Артём']);
  });

  it('вертикально объединённые заголовки не удваиваются', async () => {
    const parsed = await load('03-двухуровневая-шапка.xlsx');
    // «№», «Команда» и «Место» объединены на два уровня: в источнике должно
    // остаться одно слово, а не «№ · №».
    expect(parsed.columns[0].source).toBe('№');
    expect(parsed.columns[3].source).toBe('Команда');
    expect(parsed.columns[6].source).toBe('Место');
  });
});

describe('04-группа-колонкой.xlsx — объединённые ячейки группы', () => {
  it('растягивает объединённую ячейку группы на все её строки', async () => {
    const parsed = await load('04-группа-колонкой.xlsx');

    expect(parsed.groupColumn).toBe('category');
    expect(column(parsed, 'category')).toEqual([
      'Юноши 16-17 лет',
      'Юноши 16-17 лет',
      'Юноши 16-17 лет',
      'Девушки 16-17 лет',
      'Девушки 16-17 лет',
      'Девушки 16-17 лет',
    ]);
  });

  it('считает строки по группам', async () => {
    const parsed = await load('04-группа-колонкой.xlsx');
    expect(parsed.groups).toEqual([
      { title: 'Юноши 16-17 лет', rowCount: 3 },
      { title: 'Девушки 16-17 лет', rowCount: 3 },
    ]);
  });
});

describe('05-несколько-групп.xlsx — несколько групп в одном файле', () => {
  it('держит три группы и в каждой своё первое место', async () => {
    const parsed = await load('05-несколько-групп.xlsx');

    expect(parsed.groups.map((g) => g.title)).toEqual([
      'Юноши 14-15 лет',
      'Юноши 16-17 лет',
      'Девушки 16-17 лет',
    ]);

    const firsts = asObjects(parsed).filter((r) => r.place === '1');
    expect(firsts.map((r) => r.category)).toEqual([
      'Юноши 14-15 лет',
      'Юноши 16-17 лет',
      'Девушки 16-17 лет',
    ]);
  });
});

describe('06-заголовки-групп-строками.xlsx — группы строками поперёк таблицы', () => {
  it('превращает строку-заголовок в колонку группы', async () => {
    const parsed = await load('06-заголовки-групп-строками.xlsx');

    expect(parsed.groupColumn).toBe('category');
    expect(parsed.columns[0]).toEqual({ source: 'Группа', suggested: 'category' });
    expect(parsed.groups).toEqual([
      { title: 'Юноши 16-17 лет, 100 м вольный стиль', rowCount: 3 },
      { title: 'Девушки 16-17 лет, 100 м вольный стиль', rowCount: 2 },
    ]);
  });

  it('не считает строку-заголовок участником', async () => {
    const parsed = await load('06-заголовки-групп-строками.xlsx');
    expect(parsed.rows).toHaveLength(5);
    expect(column(parsed, 'name')).not.toContain('Юноши 16-17 лет, 100 м вольный стиль');
  });
});

describe('07-статусы.xlsx — DSQ, DNS, DNF', () => {
  it('читает графу статуса как есть', async () => {
    const parsed = await load('07-статусы.xlsx');
    expect(column(parsed, 'status')).toEqual(['', '', 'DSQ', 'DNS', 'DNF', 'DSQ', '']);
  });

  it('переносит отметку о снятии из графы места в графу статуса', async () => {
    const parsed = await load('07-статусы.xlsx');
    const grigoriev = asObjects(parsed).find((r) => r.name === 'Григорьев Илья');

    // В файле у него в графе места стоит «DSQ» — оставить это там значило бы
    // выдать снятому грамоту участника по правилу «иначе».
    expect(grigoriev).toMatchObject({ place: '', status: 'DSQ' });
    expect(parsed.warnings.join(' ')).toMatch(/перенесли её в колонку статуса/);
  });

  it('не трогает места тех, кого не снимали', async () => {
    const parsed = await load('07-статусы.xlsx');
    expect(column(parsed, 'place')).toEqual(['1', '2', '', '', '', '', '3']);
  });
});

describe('08-делёж-дефис.xlsx — делёж мест через дефис', () => {
  it('сохраняет «3-4» как написано', async () => {
    const parsed = await load('08-делёж-дефис.xlsx');
    expect(column(parsed, 'place')).toEqual(['1', '2', '3-4', '3-4', '5']);
  });
});

describe('09-делёж-равно.xlsx — делёж мест знаком равенства', () => {
  it('сохраняет «=1» и «=3» как написано', async () => {
    const parsed = await load('09-делёж-равно.xlsx');
    expect(column(parsed, 'place')).toEqual(['=1', '=1', '=3', '=3', '5', 'б/м']);
  });

  it('не принимает «=3» и «б/м» за отметку о снятии', async () => {
    const parsed = await load('09-делёж-равно.xlsx');
    // Перенос в статус срабатывает только на настоящих DSQ/DNS/DNF.
    expect(parsed.columns.some((c) => c.suggested === 'status')).toBe(false);
  });
});

describe('10-фио-заглавными.xlsx — ФИО заглавными', () => {
  it('приводит заглавные к обычному виду и не трогает смешанный регистр', async () => {
    const parsed = await load('10-фио-заглавными.xlsx');
    expect(column(parsed, 'name')).toEqual([
      'Иванов Иван Иванович',
      'Петрова-Водкина Анна Сергеевна',
      'Сидоров А. Ю.',
      'Никитин Денис Олегович',
    ]);
    expect(parsed.warnings.join(' ')).toMatch(/ФИО заглавными приведены/);
  });
});

describe('11-год-рождения.xlsx — год рождения вместо даты', () => {
  it('читает год числом, дату — датой, приписку — текстом', async () => {
    const parsed = await load('11-год-рождения.xlsx');
    // 2008 не должно превратиться в «2 008», а дата — уехать на сутки
    // из-за часового пояса машины.
    expect(column(parsed, 'birth_year')).toEqual(['2008', '2009', '12.03.2008', '2009 г.р.']);
  });
});

describe('12-результат-время.xlsx — время и десятичная запятая', () => {
  it('не теряет сотые доли при разборе времени из Excel', async () => {
    const parsed = await load('12-результат-время.xlsx');
    expect(column(parsed, 'result')).toEqual([
      // Числом в ячейке с форматом «mm:ss.00» — самый опасный случай:
      // без учёта формата это дата 30 декабря 1899 года.
      '1:02,45',
      '58,30',
      // Те же значения, введённые руками текстом, должны совпасть с ними.
      '1:02,45',
      '58,30',
      '1:02:03,50',
    ]);
  });

  it('печатает десятичную запятую, а не точку', async () => {
    const parsed = await load('12-результат-время.xlsx');
    expect(column(parsed, 'points')).toEqual(['812,5', '798,25', '798,25', '770,0', '700']);
  });
});

describe('13-команда-объединённая.xlsx — объединённые ячейки команды', () => {
  it('растягивает команду на все строки объединения', async () => {
    const parsed = await load('13-команда-объединённая.xlsx');
    expect(column(parsed, 'team')).toEqual([
      'СШОР № 1 «Волна»',
      'СШОР № 1 «Волна»',
      'СШОР № 1 «Волна»',
      'Дельфин',
      'Дельфин',
    ]);
  });
});

describe('14-тренер.xlsx — один тренер на нескольких спортсменов', () => {
  it('раздаёт тренера всем его спортсменам, включая объединённые ячейки', async () => {
    const parsed = await load('14-тренер.xlsx');
    expect(column(parsed, 'coach')).toEqual([
      'Смирнов А. П.',
      'Смирнов А. П.',
      'Козлова М. И.',
      'Козлова М. И.',
      'Смирнов А. П.',
      'Козлова М. И.',
    ]);
  });

  it('тренер пересекает границы групп — это и проверяет дедупликацию', async () => {
    const parsed = await load('14-тренер.xlsx');
    const rows = asObjects(parsed);
    const smirnov = rows.filter((r) => r.coach === 'Смирнов А. П.');
    expect(new Set(smirnov.map((r) => r.category)).size).toBe(2);
  });
});

describe('protocolColumnName', () => {
  it('узнаёт заголовки протокола, которых нет в общем словаре', () => {
    const taken = new Set<string>();
    expect(protocolColumnName('Г.р.', taken)).toBe('birth_year');
    expect(protocolColumnName('Прим.', taken)).toBe('status');
    expect(protocolColumnName('Очки', taken)).toBe('points');
    expect(protocolColumnName('Возрастная группа', taken)).toBe('category');
    expect(protocolColumnName('Тренер', taken)).toBe('coach');
  });

  it('разводит одноимённые графы суффиксом', () => {
    const taken = new Set<string>(['place']);
    expect(protocolColumnName('Место', taken)).toBe('place_2');
  });
});

describe('normalizeFullName', () => {
  it('трогает только полностью заглавные строки', () => {
    expect(normalizeFullName('ИВАНОВ ИВАН')).toBe('Иванов Иван');
    expect(normalizeFullName('Иванов Иван')).toBe('Иванов Иван');
    expect(normalizeFullName('иванов иван')).toBe('иванов иван');
  });

  it('сохраняет дефисы, инициалы и точки', () => {
    expect(normalizeFullName('ПЕТРОВА-ВОДКИНА А. С.')).toBe('Петрова-Водкина А. С.');
    expect(normalizeFullName('О’БРАЙЕН ШОН')).toBe('О’Брайен Шон');
  });
});
