import { describe, expect, it } from 'vitest';
import { SYSTEM_VARIABLE_NAMES, mergeVariables, systemVariables } from './variables';

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

describe('переменные, которые сервис считает сам', () => {
  const merged = (data: Record<string, string>) => mergeVariables(data, { issuedAt: AUG_4 });

  it('ФИО в дательном и родительном падежах', () => {
    const v = merged({ name: 'Иванов Пётр Ильич' });
    expect(v.name_dat).toBe('Иванову Петру Ильичу');
    expect(v.name_gen).toBe('Иванова Петра Ильича');
  });

  it('короткая форма ФИО с неразрывными пробелами', () => {
    const v = merged({ name: 'Иванов Пётр Ильич' });
    expect(v.name_short).toBe('Иванов П. И.');
    expect(v.name_short).not.toContain(' ');
  });

  it('место словом берётся из колонки «place»', () => {
    // Так эту колонку называет подбор имён при импорте: «Место» → place.
    expect(merged({ place: '1' }).place_word).toBe('первое');
    expect(merged({ place: '3 место' }).place_word).toBe('третье');
  });

  it('без колонки «place» переменная не появляется', () => {
    // Пустое значение подставилось бы в макет как пустота посреди фразы
    // «за  место»; отсутствие переменной отчёт проверки поймает раньше.
    expect(merged({ name: 'Иванов Пётр' }).place_word).toBeUndefined();
  });

  it('своя колонка сильнее любой из вычисленных', () => {
    // Организатор вписал руками именно потому, что наша догадка
    // его не устроила.
    const v = merged({
      name: 'Иванов Пётр',
      name_dat: 'Петровичу Иванову',
      name_gen: 'товарища Иванова',
      name_short: 'И. Иванов',
      place: '1',
      place_word: 'Гран-при',
    });
    expect(v.name_dat).toBe('Петровичу Иванову');
    expect(v.name_gen).toBe('товарища Иванова');
    expect(v.name_short).toBe('И. Иванов');
    expect(v.place_word).toBe('Гран-при');
  });

  it('без колонки «name» вместо ФИО пустота, а не «undefined» на грамоте', () => {
    const v = merged({});
    expect(v.name_dat).toBe('');
    expect(v.name_gen).toBe('');
    expect(v.name_short).toBe('');
  });

  it('все вычисляемые переменные объявлены в списке для редактора', () => {
    // Иначе подсказка в редакторе скажет «переменная неизвестна»
    // о том, что сервис на самом деле подставляет.
    for (const name of [
      'name_dat',
      'name_gen',
      'name_short',
      'name_lat_gost',
      'name_lat_icao',
      'place_word',
      'hours_word',
    ]) {
      expect(SYSTEM_VARIABLE_NAMES).toContain(name);
    }
  });

  it('ФИО латиницей по обоим стандартам', () => {
    const v = merged({ name: 'Щукин Юрий' });
    expect(v.name_lat_gost).toBe('Shhukin Yurij');
    expect(v.name_lat_icao).toBe('Shchukin Iurii');
  });

  it('своя колонка латиницы сильнее нашей таблицы', () => {
    // У человека уже есть загранпаспорт с написанием прошлых лет,
    // и на дипломе должно стоять то, что в паспорте.
    const v = merged({ name: 'Щукин Юрий', name_lat_icao: 'SHCHOUKINE Youri' });
    expect(v.name_lat_icao).toBe('SHCHOUKINE Youri');
    expect(v.name_lat_gost).toBe('Shhukin Yurij');
  });

  it('без колонки «name» латиница пустая, а не «undefined»', () => {
    const v = merged({});
    expect(v.name_lat_gost).toBe('');
    expect(v.name_lat_icao).toBe('');
  });

  it('объём часов прописью считается из «часов»', () => {
    const v = mergeVariables({}, { issuedAt: AUG_4, event: { hours: '120' } });
    expect(v.hours_word).toBe('сто двадцать часов');
  });

  it('часы, записанные не числом, остаются как есть', () => {
    // «16 академических часов», «72 ч.» — разобрать надёжно нельзя,
    // а испортить легко.
    const free = mergeVariables({}, { issuedAt: AUG_4, event: { hours: '16 академических' } });
    expect(free.hours_word).toBe('16 академических');

    const empty = mergeVariables({}, { issuedAt: AUG_4 });
    expect(empty.hours_word).toBeUndefined();
  });

  it('своя колонка «hours_word» сильнее расчёта', () => {
    const v = mergeVariables({ hours_word: 'сто двадцать академических часов' }, {
      issuedAt: AUG_4,
      event: { hours: '120' },
    });
    expect(v.hours_word).toBe('сто двадцать академических часов');
  });
});

describe('ФИО, разложенное импортом по колонкам', () => {
  /*
   * `column-names.ts` раскладывает шапку на «Фамилия», «Имя», «Отчество»,
   * и тогда колонки «name» нет вовсе. Пол по отчеству при этом определялся
   * бы, а имя на грамоте осталось бы пустым — расхождение, которое читается
   * как поломка сервиса.
   */
  const split = { surname: 'Петрова', firstname: 'Мария', patronymic: 'Ивановна' };

  it('падежи и короткая форма считаются от собранного ФИО', () => {
    const v = mergeVariables(split, { issuedAt: AUG_4 });
    expect(v.name_dat).toBe('Петровой Марии Ивановне');
    expect(v.name_gen).toBe('Петровой Марии Ивановны');
    expect(v.name_short).toBe('Петрова\u00A0М.\u00A0И.');
  });

  it('колонка «name» по-прежнему сильнее разложенных', () => {
    const v = mergeVariables({ ...split, name: 'Иванов Пётр Ильич' }, { issuedAt: AUG_4 });
    expect(v.name_dat).toBe('Иванову Петру Ильичу');
  });
});
