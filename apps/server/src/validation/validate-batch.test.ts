import { beforeAll, describe, expect, it } from 'vitest';
import { quotaFits, sheetLayout, type QuotaVerdict, type SheetLayout } from '@gramota/shared';
import { validateBatch, type ValidationInput, type ValidationRow } from './validate-batch';

/*
 * Проверка всего списка перед выпуском.
 *
 * Здесь проверяется не «функция вернула объект», а обещания, которые
 * функция даёт человеку: что она найдёт беду до печати, что не завалит
 * его выдуманными бедами и что успеет сделать это на списке, который
 * реально приносят федерации.
 */

/**
 * Блок с именем: широкий и невысокий, как на настоящей грамоте.
 *
 * Через разбор схемы, а не литералом: так блок получает те же умолчания,
 * что и настоящий, а текст с «%name» проходит тот же переход на дерево,
 * что и сохранённые макеты.
 */
function nameSheet(over: Partial<{ w: number; h: number; fontSize: number; text: string }> = {}): SheetLayout {
  return sheetLayout.parse([
    {
      id: 'name',
      type: 'text',
      x: 20,
      y: 90,
      w: over.w ?? 200,
      h: over.h ?? 20,
      rotation: 0,
      z: 0,
      props: {
        text: over.text ?? '%name',
        fontFamily: 'PT Sans',
        fontSize: over.fontSize ?? 24,
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
      },
    },
  ]);
}

const PAID: QuotaVerdict = {
  plan: 'paid',
  used: 0,
  limit: null,
  left: null,
  adding: 0,
};

function input(over: Partial<ValidationInput> = {}): ValidationInput {
  return {
    rows: [],
    sheets: [nameSheet()],
    columns: ['name', 'email'],
    quota: PAID,
    document: { orgName: 'Клуб', eventName: '', eventDate: '', eventPlace: '', eventHours: '' },
    issuedAt: new Date('2026-06-17T09:00:00Z'),
    ...over,
  };
}

function row(position: number, data: Record<string, string>, issuedAt: Date | null = null): ValidationRow {
  return { id: `row-${position}`, position, data, issuedAt };
}

/** Коды проблем строки — так удобнее утверждать, чем через полные объекты. */
function codes(report: ReturnType<typeof validateBatch>, rowId: string): string[] {
  return (report.rows.find((r) => r.rowId === rowId)?.problems ?? []).map((p) => p.code).sort();
}

describe('чистый список', () => {
  it('на безупречных строках не находит ничего', () => {
    const report = validateBatch(
      input({
        rows: [
          row(0, { name: 'Иванов Пётр Ильич', email: 'ivanov@mail.ru' }),
          row(1, { name: 'Петрова Мария Сергеевна', email: 'petrova@mail.ru' }),
        ],
      }),
    );

    expect(report.total).toBe(2);
    expect(report.clean).toBe(2);
    expect(report.blocked).toBe(0);
    // Чистые строки в разбор не попадают: на списке в десять тысяч человек
    // они утроили бы вес ответа, ничего не сообщив.
    expect(report.rows).toHaveLength(0);
  });
});

describe('переполнение блока', () => {
  it('длинное ФИО в узком блоке не влезает', () => {
    const report = validateBatch(
      input({
        sheets: [nameSheet({ w: 60, h: 12, fontSize: 24 })],
        rows: [row(0, { name: 'Константинопольский Владислав Вячеславович', email: 'k@mail.ru' })],
      }),
    );

    expect(codes(report, 'row-0')).toContain('overflow');
  });

  it('короткое ФИО в том же блоке влезает', () => {
    const report = validateBatch(
      input({
        sheets: [nameSheet({ w: 60, h: 12, fontSize: 24 })],
        rows: [row(0, { name: 'Ким Ён Ха', email: 'k@mail.ru' })],
      }),
    );

    expect(codes(report, 'row-0')).not.toContain('overflow');
  });

  it('в причине сказано, что именно не влезло', () => {
    const report = validateBatch(
      input({
        sheets: [nameSheet({ w: 50, h: 10, fontSize: 24 })],
        rows: [row(0, { name: 'Константинопольский Владислав', email: 'k@mail.ru' })],
      }),
    );

    const problem = report.rows[0].problems.find((p) => p.code === 'overflow');
    expect(problem?.detail).toContain('Константинопольский Владислав');
  });

  it('постоянный текст макета разбирается отдельно, а не в каждой строке', () => {
    // Иначе одна беда вёрстки превратилась бы в десять тысяч одинаковых
    // предупреждений, за которыми не видно настоящих.
    const layout: SheetLayout = [
      ...nameSheet(),
      {
        ...nameSheet({ text: 'Благодарственное письмо за многолетний труд' })[0],
        id: 'static',
        w: 30,
        h: 8,
      },
    ];

    const report = validateBatch(
      input({ sheets: [layout], rows: [row(0, { name: 'Ким', email: 'k@mail.ru' })] }),
    );

    expect(codes(report, 'row-0')).not.toContain('overflow');
    expect(report.caveats.join(' ')).toContain('постоянный текст');
  });
});

describe('пустые обязательные поля', () => {
  it('пустое имя при «%name» в макете — беда', () => {
    const report = validateBatch(
      input({ rows: [row(0, { name: '', email: 'k@mail.ru' })] }),
    );
    expect(codes(report, 'row-0')).toContain('required_empty');
  });

  it('пробелы вместо имени считаются пустотой', () => {
    const report = validateBatch(
      input({ rows: [row(0, { name: '   ', email: 'k@mail.ru' })] }),
    );
    expect(codes(report, 'row-0')).toContain('required_empty');
  });

  it('колонка, которой нет в макете, обязательной не считается', () => {
    // Пустой телефон не мешает выпустить грамоту, если телефон нигде
    // не печатается.
    const report = validateBatch(
      input({
        columns: ['name', 'email', 'phone'],
        rows: [row(0, { name: 'Ким', email: 'k@mail.ru', phone: '' })],
      }),
    );
    expect(codes(report, 'row-0')).not.toContain('required_empty');
  });

  it('служебные переменные с человека не спрашиваются', () => {
    // %date и %org подставляет сам сервис — требовать их колонкой нечестно.
    const report = validateBatch(
      input({
        sheets: [nameSheet({ text: '%name, %date, %org' })],
        rows: [row(0, { name: 'Ким', email: 'k@mail.ru' })],
      }),
    );
    expect(codes(report, 'row-0')).not.toContain('required_empty');
  });
});

describe('повторы', () => {
  it('одинаковые ФИО отмечаются в обеих строках', () => {
    const report = validateBatch(
      input({
        rows: [
          row(0, { name: 'Иванов Пётр', email: 'a@mail.ru' }),
          row(1, { name: 'Иванов Пётр', email: 'b@mail.ru' }),
        ],
      }),
    );

    expect(codes(report, 'row-0')).toContain('duplicate_name');
    expect(codes(report, 'row-1')).toContain('duplicate_name');
  });

  it('повтор ФИО и повтор почты — разные беды', () => {
    const report = validateBatch(
      input({
        rows: [
          row(0, { name: 'Иванов Пётр', email: 'общий@mail.ru' }),
          row(1, { name: 'Петров Иван', email: 'общий@mail.ru' }),
        ],
      }),
    );

    expect(codes(report, 'row-0')).toContain('duplicate_email');
    expect(codes(report, 'row-0')).not.toContain('duplicate_name');
  });

  it('«Пётр» и «Петр» — один человек, а не два', () => {
    const report = validateBatch(
      input({
        rows: [
          row(0, { name: 'Иванов Пётр', email: 'a@mail.ru' }),
          row(1, { name: 'ИВАНОВ ПЕТР', email: 'b@mail.ru' }),
        ],
      }),
    );
    expect(codes(report, 'row-0')).toContain('duplicate_name');
  });

  it('в причине названы номера остальных строк', () => {
    const report = validateBatch(
      input({
        rows: [
          row(0, { name: 'Иванов Пётр', email: 'a@mail.ru' }),
          row(1, { name: 'Иванов Пётр', email: 'b@mail.ru' }),
        ],
      }),
    );

    const problem = report.rows[0].problems.find((p) => p.code === 'duplicate_name');
    expect(problem?.detail).toContain('2');
  });

  it('пустые адреса повтором друг друга не считаются', () => {
    const report = validateBatch(
      input({
        rows: [
          row(0, { name: 'Иванов Пётр', email: '' }),
          row(1, { name: 'Петров Иван', email: '' }),
        ],
      }),
    );
    expect(codes(report, 'row-0')).not.toContain('duplicate_email');
  });
});

describe('адреса почты', () => {
  it('кириллица в адресе — отдельная беда со своей причиной', () => {
    const report = validateBatch(
      input({ rows: [row(0, { name: 'Ким', email: 'ivanоv@mail.ru' })] }),
    );

    expect(codes(report, 'row-0')).toContain('email_mixed_script');
    const problem = report.rows[0].problems.find((p) => p.code === 'email_mixed_script');
    // Исправление предлагаем сразу: набрано в русской раскладке.
    expect(problem?.suggestion).toBe('ivanov@mail.ru');
  });

  it('«нет почты» в ячейке — неверный адрес', () => {
    const report = validateBatch(
      input({ rows: [row(0, { name: 'Ким', email: 'нет почты' })] }),
    );
    expect(codes(report, 'row-0')).toContain('email_invalid');
  });

  it('русские буквы в адресе — подозрение, а не запрет', () => {
    /*
     * Почти всегда это русская раскладка и письмо не дойдёт, но
     * «иван@mail.ru» у российских провайдеров законен. Запрет молча снимал бы
     * такие строки кнопкой «снять отметки с проблемных» — то есть лишал бы
     * человека грамоты из-за нашей догадки.
     */
    const report = validateBatch(
      input({ rows: [row(0, { name: 'Иван Ильич', email: 'ivanоv@mail.ru' })] }),
    );
    expect(codes(report, 'row-0')).toContain('email_mixed_script');
    expect(report.blocked).toBe(0);
  });

  it('полностью кириллический адрес не трогаем — он бывает настоящим', () => {
    const report = validateBatch(
      input({ rows: [row(0, { name: 'Иван Ильич', email: 'иван@почта.рф' })] }),
    );
    expect(codes(report, 'row-0')).not.toContain('email_mixed_script');
  });

  it('пустой адрес бедой не считается: грамоту отдадут на руки', () => {
    const report = validateBatch(input({ rows: [row(0, { name: 'Ким', email: '' })] }));
    expect(codes(report, 'row-0')).not.toContain('email_invalid');
  });

  it('лишние пробелы в адресе чинятся подсказкой', () => {
    const report = validateBatch(
      input({ rows: [row(0, { name: 'Ким', email: 'ivanov @ mail.ru' })] }),
    );
    const problem = report.rows[0].problems.find((p) => p.code === 'email_invalid');
    expect(problem?.suggestion).toBe('ivanov@mail.ru');
  });
});

describe('ФИО прописными', () => {
  it('находит и предлагает исправление', () => {
    const report = validateBatch(
      input({ rows: [row(0, { name: 'ИВАНОВ ПЁТР ИЛЬИЧ', email: 'k@mail.ru' })] }),
    );

    const problem = report.rows[0].problems.find((p) => p.code === 'name_uppercase');
    expect(problem?.suggestion).toBe('Иванов Пётр Ильич');
  });

  it('это подозрение, а не запрет: строку выпускать можно', () => {
    const report = validateBatch(
      input({ rows: [row(0, { name: 'ИВАНОВ ПЁТР', email: 'k@mail.ru' })] }),
    );
    expect(report.blocked).toBe(0);
  });
});

describe('склонение', () => {
  it('спрашивается только когда падеж печатается', () => {
    const withoutCase = validateBatch(
      input({ rows: [row(0, { name: 'John Smith', email: 'j@mail.ru' })] }),
    );
    expect(codes(withoutCase, 'row-0')).not.toContain('name_not_declined');

    const withCase = validateBatch(
      input({
        sheets: [nameSheet({ text: 'Награждается %name_dat' })],
        rows: [row(0, { name: 'John Smith', email: 'j@mail.ru' })],
      }),
    );
    expect(codes(withCase, 'row-0')).toContain('name_not_declined');
  });

  it('своя колонка падежа отменяет догадку', () => {
    // Организатор вписал падеж руками именно потому, что автоматика
    // его не устроила, — спорить с ним не о чем.
    const report = validateBatch(
      input({
        sheets: [nameSheet({ text: 'Награждается %name_dat' })],
        columns: ['name', 'email', 'name_dat'],
        rows: [row(0, { name: 'John Smith', email: 'j@mail.ru', name_dat: 'Джону Смиту' })],
      }),
    );
    expect(codes(report, 'row-0')).not.toContain('name_not_declined');
  });
});

describe('даты', () => {
  it('несуществующая дата среди нормальных находится', () => {
    const report = validateBatch(
      input({
        columns: ['name', 'email', 'date'],
        rows: [
          row(0, { name: 'А', email: 'a@mail.ru', date: '17.06.2026' }),
          row(1, { name: 'Б', email: 'b@mail.ru', date: '18.06.2026' }),
          row(2, { name: 'В', email: 'c@mail.ru', date: '19.06.2026' }),
          row(3, { name: 'Г', email: 'd@mail.ru', date: '31.02.2026' }),
        ],
      }),
    );

    expect(codes(report, 'row-3')).toContain('date_invalid');
    expect(codes(report, 'row-0')).not.toContain('date_invalid');
  });

  it('колонка со свободным текстом не разбирается как даты', () => {
    const report = validateBatch(
      input({
        columns: ['name', 'email', 'date'],
        rows: [
          row(0, { name: 'А', email: 'a@mail.ru', date: 'весенняя сессия' }),
          row(1, { name: 'Б', email: 'b@mail.ru', date: 'осенняя сессия' }),
          row(2, { name: 'В', email: 'c@mail.ru', date: 'зимняя сессия' }),
          row(3, { name: 'Г', email: 'd@mail.ru', date: '17.06.2026' }),
        ],
      }),
    );

    expect(report.rows.flatMap((r) => r.problems.map((p) => p.code))).not.toContain('date_invalid');
  });
});

describe('повторная выдача', () => {
  it('строка с прежним живым файлом отмечается', () => {
    const report = validateBatch(
      input({
        rows: [row(0, { name: 'Ким', email: 'k@mail.ru' }, new Date('2026-05-01T10:00:00Z'))],
      }),
    );

    expect(codes(report, 'row-0')).toContain('already_issued');
    const problem = report.rows[0].problems.find((p) => p.code === 'already_issued');
    expect(problem?.detail).toContain('01.05.2026');
  });
});

describe('квота', () => {
  it('на оплаченном тарифе предела нет', () => {
    const report = validateBatch(input({ rows: [row(0, { name: 'Ким', email: 'k@mail.ru' })] }));
    expect(quotaFits(report.quota)).toBe(true);
  });

  it('остаток доносится до отчёта как есть — своего расчёта проверка не заводит', () => {
    const quota: QuotaVerdict = { plan: 'free', used: 45, limit: 50, left: 5, adding: 3 };
    const report = validateBatch(
      input({ quota, rows: [row(0, { name: 'Ким', email: 'k@mail.ru' })] }),
    );
    expect(report.quota).toEqual(quota);
  });

  it('нехватка считается тем же сравнением, что и шлагбаум выпуска', () => {
    // GenerationService.checkFreeLimit пускает, пока used + adding <= limit.
    expect(quotaFits({ plan: 'free', used: 45, limit: 50, left: 5, adding: 5 })).toBe(true);
    expect(quotaFits({ plan: 'free', used: 45, limit: 50, left: 5, adding: 6 })).toBe(false);
  });

  it('на оплаченном тарифе не хватить не может', () => {
    expect(
      quotaFits({ plan: 'paid', used: 100_000, limit: null, left: null, adding: 10_000 }),
    ).toBe(true);
  });
});

describe('оговорки', () => {
  it('о неразобранных правилах награждения говорится вслух', () => {
    const report = validateBatch(input({ rows: [row(0, { name: 'Ким', email: 'k@mail.ru' })] }));
    const caveats = report.caveats.join(' ');
    expect(caveats).toContain('награжд');
    // Вкладка «Правила» работает, и оговорка не должна говорить обратное:
    // прежнее «этой части сервиса ещё нет» отправляло человека искать
    // несуществующую пропажу вместо того, чтобы проверить места глазами.
    expect(caveats).not.toContain('ещё нет');
  });

  it('о невыполненном автомасштабе предупреждается прямо', () => {
    // Пока рендер не уменьшает текст, обещать «влезет после автомасштаба»
    // нельзя — иначе проверка соврёт ровно там, где на неё положились.
    const layout = nameSheet();
    layout[0].props.autoFit = true;
    const report = validateBatch(
      input({ sheets: [layout], rows: [row(0, { name: 'Ким', email: 'k@mail.ru' })] }),
    );
    expect(report.caveats.join(' ')).toContain('автомасштаб');
  });

  it('макет без переменных честно объявляется непроверяемым', () => {
    const report = validateBatch(
      input({
        sheets: [nameSheet({ text: 'Грамота' })],
        rows: [row(0, { name: 'Ким', email: 'k@mail.ru' })],
      }),
    );
    expect(report.caveats.join(' ')).toContain('переменны');
  });
});

describe('крупная группа дубликатов', () => {
  /*
   * Общий адрес координатора во всех строках списка — обычное дело,
   * и когда-то на нём проверка строила для каждой строки полный список
   * остальных: на пяти тысячах это двадцать пять миллионов операций
   * и сотни мегабайт. Перф-тест такого не ловил: там группы по сотне.
   */
  const SIZE = 5000;
  const rows = Array.from({ length: SIZE }, (_, i) =>
    row(i, { name: `Участник ${i} Иванович`, email: 'coordinator@example.org' }),
  );

  /*
   * Своё время прогона: каждая проверка здесь разбирает пять тысяч строк,
   * и пяти секунд по умолчанию не хватало, когда рядом шли остальные файлы.
   * Потолок самого замера от этого не меняется — он ниже и живёт в тесте.
   */
  const RUN_MS = 60_000;

  // Прогрев, чтобы в замер не попало одноразовое раскрытие метрик шрифтов:
  // на боевом сервере оно случается один раз, а не на каждую проверку.
  beforeAll(() => {
    validateBatch(input(rows.slice(0, 50)));
  }, RUN_MS);

  it('не встаёт колом на общем адресе во всех строках', () => {
    const started = performance.now();
    const report = validateBatch(input({ rows }));
    const elapsed = performance.now() - started;

    // Потолок грубый с запасом к замеру (около секунды): ловить он должен
    // возврат к квадратичному разбору — замедление в десятки раз, — а не
    // дрожание JIT и загруженной машины сборки.
    console.log(`группа из ${SIZE} одинаковых адресов: ${elapsed.toFixed(0)} мс`);
    expect(elapsed).toBeLessThan(6000);
    expect(report.rows).toHaveLength(SIZE);
  }, RUN_MS);

  it('в причине показывает пять номеров и счёт остальных', () => {
    const report = validateBatch(input({ rows }));
    const detail = report.rows[0].problems.find((p) => p.code === 'duplicate_email')!.detail;

    // Пять номеров, потом «и ещё N» — а не простыня на пять тысяч.
    expect(detail).toContain('и ещё');
    expect(detail).toContain(String(SIZE - 1 - 5));
    expect(detail.length).toBeLessThan(120);
  }, RUN_MS);

  it('строку не считает дубликатом самой себя', () => {
    const report = validateBatch(input({ rows }));
    const first = report.rows[0].problems.find((p) => p.code === 'duplicate_email')!.detail;
    // Первая строка — номер 1; в списке остальных её быть не должно.
    expect(first).not.toMatch(/(^|\D)1(\D|$)/);
  }, RUN_MS);
});

describe('несколько бед в одной строке', () => {
  it('показываются все сразу — чинить их будут за один заход', () => {
    const report = validateBatch(
      input({
        sheets: [nameSheet({ w: 50, h: 10, fontSize: 24, text: 'Награждается %name_dat' })],
        rows: [
          row(0, { name: 'КОНСТАНТИНОПОЛЬСКИЙ ВЛАДИСЛАВ ВЯЧЕСЛАВОВИЧ', email: 'ivanоv@mail.ru' }),
          row(1, { name: 'КОНСТАНТИНОПОЛЬСКИЙ ВЛАДИСЛАВ ВЯЧЕСЛАВОВИЧ', email: 'b@mail.ru' }),
        ],
      }),
    );

    const found = codes(report, 'row-0');
    expect(found).toContain('overflow');
    expect(found).toContain('name_uppercase');
    expect(found).toContain('email_mixed_script');
    expect(found).toContain('duplicate_name');
  });
});
