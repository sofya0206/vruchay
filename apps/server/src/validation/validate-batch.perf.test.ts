import { beforeAll, describe, expect, it } from 'vitest';
import type { QuotaVerdict, SheetLayout, TextElement } from '@gramota/shared';
import { validateBatch, type ValidationInput, type ValidationRow } from './validate-batch';

/*
 * Сколько времени занимает проверка настоящего списка.
 *
 * Федерации приносят таблицы на тысячи человек, и проверка запускается
 * прямо перед выпуском — то есть человек стоит и ждёт. Обещание простое:
 * единицы секунд, а не минуты. Если оно перестанет выполняться, узнать
 * об этом надо здесь, а не от организатора в день награждения.
 *
 * Здесь нет ни базы, ни браузера: измеряется ровно та работа, которую
 * делает сама проверка.
 */

const ROWS = 10_000;

/**
 * Потолок времени.
 *
 * Взят с большим запасом к настоящему замеру и намеренно грубый: ловить он
 * должен обвал на порядок — проверку, ставшую минутной, — а не разницу
 * между секундой и тремя. Установившееся время видно в соседнем тесте
 * про линейный рост: там тот же список разбирается примерно за секунду.
 * Первые же разборы в процессе идут втрое дольше, пока V8 не оптимизирует
 * горячие циклы, и на загруженной машине сборки этот разброс ещё шире.
 * Тонкий потолок здесь давал бы красный тест без единой правки в коде.
 */
const BUDGET_MS = 10_000;

const SURNAMES = [
  'Иванов', 'Петров', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Соколов',
  'Михайлов', 'Новиков', 'Фёдоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев',
  'Семёнов', 'Егоров', 'Павлов', 'Козлов', 'Степанов', 'Николаев',
  'Константинопольский', 'Раздобудько-Незнамов', 'Мамедов', 'Тер-Аванесян',
];
const NAMES = [
  'Пётр', 'Иван', 'Мария', 'Анна', 'Владислав', 'Екатерина', 'Никита',
  'Илья', 'Александра', 'Дмитрий', 'Светлана', 'Юрий',
];
const PATRONYMICS = [
  'Ильич', 'Петрович', 'Сергеевна', 'Владимировна', 'Вячеславович',
  'Аркадьевич', 'Ильинична', 'Юрьевна',
];

/**
 * Синтетический список, похожий на настоящий.
 *
 * Важно не «десять тысяч одинаковых строк»: на них кэш измерений сработал бы
 * один раз, и замер показал бы скорость кэша, а не проверки. Поэтому имена
 * перебираются так, чтобы почти все были разными, — а заодно подмешаны
 * настоящие беды в тех долях, в каких они встречаются в жизни.
 */
function syntheticRows(count: number): ValidationRow[] {
  const rows: ValidationRow[] = [];

  for (let i = 0; i < count; i++) {
    const surname = SURNAMES[i % SURNAMES.length];
    const name = NAMES[(i * 7) % NAMES.length];
    const patronymic = PATRONYMICS[(i * 11) % PATRONYMICS.length];

    /*
     * Номер в фамилии разводит тёзок. Без него сочетаний из наших списков
     * не хватает на десять тысяч строк, и почти весь список становится
     * повторами — а это уже не похоже на настоящую таблицу участников.
     * Повторы подмешиваем отдельно и в той доле, в какой они бывают
     * в жизни: пара процентов на список.
     */
    const full =
      i % 100 === 7
        ? 'Тёзкин Иван Иванович'
        : `${surname}-${i} ${name} ${patronymic}`;

    let email = `user${i}@example.org`;
    if (i % 200 === 0) email = 'нет почты';
    if (i % 350 === 0) email = `usеr${i}@example.org`; // русская «е»
    if (i % 97 === 0) email = 'общий@example.org';

    rows.push({
      id: `row-${i}`,
      position: i,
      data: {
        name: i % 40 === 0 ? full.toLocaleUpperCase('ru-RU') : full,
        email,
        date: i % 500 === 0 ? '31.02.2026' : '17.06.2026',
        team: `Команда ${i % 60}`,
      },
      issuedAt: i % 1000 === 0 ? new Date('2026-05-01T10:00:00Z') : null,
    });
  }

  return rows;
}

function text(
  id: string,
  body: string,
  box: { x: number; y: number; w: number; h: number },
  over: Partial<TextElement['props']> = {},
): TextElement {
  return {
    id,
    type: 'text',
    ...box,
    rotation: 0,
    z: 0,
    props: {
      text: body,
      fontFamily: 'PT Sans',
      fontSize: 18,
      color: '#000000',
      align: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
      bold: false,
      italic: false,
      underline: false,
      uppercase: false,
      strokeWidth: 0,
      autoFit: false,
      ...over,
    },
  };
}

/** Макет вроде настоящей грамоты: заголовок, имя, мероприятие, дата, номер. */
function realisticSheet(): SheetLayout {
  return [
    text('title', 'Награждается', { x: 40, y: 50, w: 217, h: 12 }, { fontSize: 20 }),
    text(
      'name',
      '%name',
      { x: 20, y: 70, w: 257, h: 16 },
      { fontSize: 28, bold: true, fontFamily: 'PT Serif' },
    ),
    text('event', 'за участие в %event, %event_place', { x: 30, y: 95, w: 237, h: 14 }),
    text('team', '%team', { x: 30, y: 115, w: 237, h: 10 }, { fontSize: 14 }),
    text('date', '%date · № %number', { x: 30, y: 175, w: 100, h: 8 }, { fontSize: 11 }),
  ];
}

const QUOTA: QuotaVerdict = { plan: 'paid', used: 0, limit: null, left: null, adding: ROWS };

function input(rows: ValidationRow[]): ValidationInput {
  return {
    rows,
    sheets: [realisticSheet()],
    columns: ['name', 'email', 'date', 'team'],
    quota: QUOTA,
    document: {
      orgName: 'Федерация плавания области',
      eventName: 'первенство области по плаванию',
      eventDate: '17–19 июня 2026 года',
      eventPlace: 'г. Челябинск',
      eventHours: '',
    },
    issuedAt: new Date('2026-06-20T09:00:00Z'),
  };
}

describe(`проверка списка на ${ROWS} строк`, () => {
  const rows = syntheticRows(ROWS);

  /*
   * Прогрев списком поменьше — как если бы сервер уже отвечал на проверки.
   *
   * Первый в процессе разбор раскрывает метрики шрифтов (двадцать тысяч
   * символов по начертаниям) и прогревает JIT на горячих циклах. На боевом
   * сервере это случается один раз за всё время его жизни, а мерить мы хотим
   * стоимость одной проверки. Без прогрева первый замер показывал шесть
   * секунд там, где установившееся время около одной, и тест падал от
   * соседних файлов, гонявшихся параллельно.
   */
  beforeAll(() => {
    validateBatch(input(rows.slice(0, 1000)));
  });

  it('укладывается в единицы секунд', () => {
    const started = performance.now();
    const report = validateBatch(input(rows));
    const elapsed = performance.now() - started;

    // Печатаем всегда: замер полезен и когда тест проходит — по нему
    // видно, что происходит со скоростью от правки к правке.
    console.log(
      `${ROWS} строк за ${elapsed.toFixed(0)} мс ` +
        `(${report.rows.length} с проблемами, ${report.clean} чистых)`,
    );

    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('находит подмешанные беды, а не молчит', () => {
    // Без этого «быстро» ничего не значило бы: пустой ответ тоже быстрый.
    const report = validateBatch(input(rows));
    const found = new Set(report.rows.flatMap((r) => r.problems.map((p) => p.code)));

    expect(found).toContain('email_invalid');
    expect(found).toContain('email_mixed_script');
    expect(found).toContain('duplicate_email');
    expect(found).toContain('name_uppercase');
    expect(found).toContain('date_invalid');
    expect(found).toContain('already_issued');
  });

  it('чистых строк большинство — проверка не придирается ко всему подряд', () => {
    // Проверка, ругающаяся на каждую строку, бесполезна ровно так же,
    // как молчащая: человек перестаёт её читать.
    const report = validateBatch(input(rows));
    expect(report.clean).toBeGreaterThan(ROWS * 0.8);
  });

  it('растёт линейно, а не квадратично', () => {
    /*
     * Поиск повторов — самое опасное место: наивное сравнение каждой
     * строки с каждой на десяти тысячах даёт пятьдесят миллионов пар
     * и минуты работы. Сравниваем время на двух размерах: у линейного
     * роста отношение около двух, у квадратичного — около четырёх.
     */
    const half = rows.slice(0, ROWS / 2);

    const t1 = performance.now();
    validateBatch(input(half));
    const halfMs = performance.now() - t1;

    const t2 = performance.now();
    validateBatch(input(rows));
    const fullMs = performance.now() - t2;

    console.log(`${ROWS / 2} строк: ${halfMs.toFixed(0)} мс, ${ROWS}: ${fullMs.toFixed(0)} мс`);
    expect(fullMs / Math.max(halfMs, 1)).toBeLessThan(3);
  });
});
