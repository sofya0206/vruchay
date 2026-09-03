import {
  AWARDING_RULES_CAVEAT,
  AWARDING_RULES_READY,
  checkAwardingRules,
  mergeVariables,
  SYSTEM_VARIABLE_NAMES,
  type BatchValidation,
  type QuotaVerdict,
  type RowProblem,
  type SheetLayout,
  type ValidatedRow,
} from '@gramota/shared';
import {
  cyrillicInEmail,
  declensionFailed,
  groupDuplicates,
  isAllUppercase,
  isDateColumn,
  looksLikeDateColumn,
  looksLikeEmail,
  mixedScriptInEmail,
  normalizeEmail,
  normalizeName,
  parseLooseDate,
  toTitleCase,
} from './row-checks';
import { FitCache, fitTargets, renderTarget, staticOverflows } from './text-fit';

/**
 * Проверка всего списка перед выпуском — сердце функции.
 *
 * Чистая функция: на вход строки, макет и разбор квоты, на выход отчёт.
 * Ни базы, ни сессии, ни браузера. Так её можно прогнать на десяти тысячах
 * синтетических строк в тесте и увидеть настоящее время работы, а не время
 * работы базы.
 *
 * Порядок проверок — от того, что портит грамоту, к тому, что вызывает
 * подозрение. Одна строка может собрать несколько проблем сразу, и все
 * они показываются: чинить их человек будет за один заход.
 */

export interface ValidationRow {
  id: string;
  position: number;
  data: Record<string, string>;
  /** Строке уже выпускали документ по этому же материалу. */
  issuedAt: Date | null;
}

export interface ValidationInput {
  rows: ValidationRow[];
  sheets: SheetLayout[];
  /** Колонки таблицы получателей — в порядке, в каком их видит человек. */
  columns: string[];
  quota: QuotaVerdict;
  document: {
    orgName: string;
    eventName: string;
    eventDate: string;
    eventPlace: string;
    eventHours: string;
  };
  /** Момент выпуска: служебные переменные без него не подставить. */
  issuedAt: Date;
}

/**
 * Образец проверочного кода для измерения.
 *
 * Настоящий появляется только в момент печати, а «%code» на грамоте
 * занимает место, и без подстановки блок мерился бы пустым. Берём строку
 * той же длины, что и настоящий идентификатор.
 */
const SAMPLE_PUBLIC_ID = '00000000-0000-0000-0000-000000000000';
const SAMPLE_REG_NUMBER = '1000/2026';

/** Колонка с именем получателя — по ней ищут дубликаты и склонение. */
const NAME_COLUMN = 'name';
const EMAIL_COLUMN = 'email';

/** Сколько номеров строк показываем в причине: длиннее никто не читает. */
const SHOWN_DUPLICATES = 5;

/**
 * Номера остальных строк группы — без построения их полного списка.
 *
 * Полный массив здесь стоил бы дорого именно в том случае, ради которого
 * проверка и нужна: организатор ставит общий адрес координатора во все
 * пять тысяч строк, и «для каждой строки собрать остальные» превращается
 * в двадцать пять миллионов операций и сотни мегабайт. Показываем пять
 * номеров, поэтому и читаем ровно пять — остальное считается вычитанием.
 */
function otherPositions(positions: number[], self: number): string {
  const shown: number[] = [];
  for (const position of positions) {
    if (position === self) continue;
    shown.push(position);
    if (shown.length === SHOWN_DUPLICATES) break;
  }
  const rest = positions.length - 1 - shown.length;
  const list = shown.join(', ');
  return rest > 0 ? `${list} и ещё ${rest}` : list;
}

export function validateBatch(input: ValidationInput): BatchValidation {
  const { rows, sheets, columns, quota, document } = input;

  const targets = fitTargets(sheets);
  const cache = new FitCache();

  /*
   * Какие переменные обязаны прийти из таблицы.
   *
   * Всё, что упомянуто в макете и не является служебным: служебные
   * подставляет сам сервис, и спрашивать их с человека нечестно.
   * «name_dat» служебная, но берётся из «name» — поэтому имя
   * становится обязательным вместе с ней.
   */
  const used = new Set(targets.flatMap((t) => t.variables));
  const required = new Set<string>();
  for (const name of used) {
    if (name === 'name_dat') {
      required.add(NAME_COLUMN);
      continue;
    }
    if (SYSTEM_VARIABLE_NAMES.includes(name)) continue;
    required.add(name);
  }

  const needsDeclension = used.has('name_dat') && !columns.includes('name_dat');

  // Колонки-даты определяем по всей таблице разом: по одной ячейке
  // не понять, дата это или свободный текст.
  const dateColumns = columns.filter(
    (name) => looksLikeDateColumn(name) && isDateColumn(rows.map((r) => r.data[name] ?? '')),
  );

  const problemsByRow = new Map<string, RowProblem[]>();
  const add = (rowId: string, problem: RowProblem) => {
    const list = problemsByRow.get(rowId);
    if (list) list.push(problem);
    else problemsByRow.set(rowId, [problem]);
  };

  // Подставленные данные считаем один раз: они нужны и измерению,
  // и проверке пустых полей.
  const substituted = new Map<string, Record<string, string>>();
  for (const row of rows) {
    substituted.set(
      row.id,
      mergeVariables(row.data, {
        issuedAt: input.issuedAt,
        number: row.position + 1,
        total: rows.length,
        publicId: SAMPLE_PUBLIC_ID,
        // Настоящий номер выделяется при выпуске; для измерения — образец
        // той же длины, что и настоящий у крупной организации.
        regNumber: SAMPLE_REG_NUMBER,
        orgName: document.orgName,
        event: {
          name: document.eventName,
          date: document.eventDate,
          place: document.eventPlace,
          hours: document.eventHours,
        },
      }),
    );
  }

  for (const row of rows) {
    const data = substituted.get(row.id)!;

    // Пустые обязательные поля.
    for (const name of required) {
      if ((row.data[name] ?? '').trim() === '') {
        add(row.id, {
          code: 'required_empty',
          column: name,
          detail: `Колонка «${name}» пустая, а в макете есть %${name}`,
        });
      }
    }

    // Переполнение блока.
    for (const target of targets) {
      const rendered = renderTarget(target, data);
      const text = rendered.text;
      if (!text.trim()) continue;

      const result = cache.measure(target, rendered);
      if (result.fits) continue;

      const percent = Math.round((result.overflowRatio - 1) * 100);
      const where = sheets.length > 1 ? `на листе ${target.sheetNumber} ` : '';
      const scaled = target.autoFit ? ' даже после автомасштаба' : '';
      add(row.id, {
        code: 'overflow',
        column: target.variables.find((v) => required.has(v)) ?? null,
        detail:
          `Блок ${where}не вмещает «${text.trim()}»${scaled}: ` +
          `нужно ${result.lines} ${plural(result.lines, 'строка', 'строки', 'строк')}, ` +
          `текст выше блока на ${Math.max(percent, 1)}%`,
      });
    }

    const name = (row.data[NAME_COLUMN] ?? '').trim();
    const email = (row.data[EMAIL_COLUMN] ?? '').trim();

    /*
     * Почта. Сперва форма, потом раскладка.
     *
     * Порядок важен: в ячейке часто стоит не адрес, а «нет почты»
     * или «уточнить». Спроси мы сначала про русские буквы — человек
     * получил бы про такую ячейку совет «уберите русские буквы»
     * вместо простого «это не адрес».
     */
    if (email) {
      if (!looksLikeEmail(email)) {
        add(row.id, {
          code: 'email_invalid',
          column: EMAIL_COLUMN,
          detail: `«${email}» не похож на адрес почты`,
          suggestion: repairEmail(email),
        });
      } else {
        const mixed = mixedScriptInEmail(email);
        if (mixed.length) {
          add(row.id, {
            code: 'email_mixed_script',
            column: EMAIL_COLUMN,
            detail: `Русские буквы в латинском адресе: ${mixed.map((c) => `«${c}»`).join(', ')}`,
            suggestion: latinize(email),
          });
        }
      }
    }

    // ФИО прописными.
    if (name && isAllUppercase(name)) {
      add(row.id, {
        code: 'name_uppercase',
        column: NAME_COLUMN,
        detail: `«${name}» записано прописными`,
        suggestion: toTitleCase(name),
      });
    }

    // Склонение.
    if (needsDeclension && name && declensionFailed(name)) {
      add(row.id, {
        code: 'name_not_declined',
        column: NAME_COLUMN,
        detail: `«${name}» не удалось поставить в дательный падеж`,
      });
    }

    // Даты.
    for (const column of dateColumns) {
      const value = (row.data[column] ?? '').trim();
      if (!value || parseLooseDate(value)) continue;
      add(row.id, {
        code: 'date_invalid',
        column,
        detail: `«${value}» в колонке «${column}» не разбирается как дата`,
      });
    }

    // Повторная выдача.
    if (row.issuedAt) {
      add(row.id, {
        code: 'already_issued',
        column: null,
        detail: `Документ по этой строке уже выпускали ${formatDate(row.issuedAt)}`,
      });
    }
  }

  // Дубликаты — отдельным проходом: они видны только на всём списке сразу.
  const markDuplicates = (
    groups: Map<string, ValidationRow[]>,
    code: 'duplicate_name' | 'duplicate_email',
    column: string,
    what: string,
  ) => {
    for (const group of groups.values()) {
      // Один массив на группу, а не на каждую её строку.
      const positions = group.map((r) => r.position + 1);
      const others = positions.length - 1;
      for (const row of group) {
        add(row.id, {
          code,
          column,
          detail: `${what} в ${others === 1 ? 'строке' : 'строках'} ${otherPositions(positions, row.position + 1)}`,
        });
      }
    }
  };

  markDuplicates(
    groupDuplicates(rows, (r) => normalizeName(r.data[NAME_COLUMN] ?? '') || null),
    'duplicate_name',
    NAME_COLUMN,
    'Такое же ФИО',
  );

  markDuplicates(
    groupDuplicates(rows, (r) => normalizeEmail(r.data[EMAIL_COLUMN] ?? '') || null),
    'duplicate_email',
    EMAIL_COLUMN,
    'Такой же адрес',
  );

  // Правила награждения — пока пустышка, см. awarding-rules.ts.
  for (const check of checkAwardingRules(
    rows.map((r) => ({ rowId: r.id, data: r.data })),
    null,
  )) {
    for (const problem of check.problems) add(check.rowId, problem);
  }

  const validated: ValidatedRow[] = rows.map((row) => ({
    rowId: row.id,
    position: row.position + 1,
    title: (row.data[NAME_COLUMN] ?? '').trim() || `Строка ${row.position + 1}`,
    problems: problemsByRow.get(row.id) ?? [],
  }));

  const withProblems = validated.filter((r) => r.problems.length > 0);
  const blocked = withProblems.filter((r) =>
    r.problems.some((p) => BLOCKING.has(p.code)),
  ).length;

  return {
    total: rows.length,
    clean: rows.length - withProblems.length,
    blocked,
    // Отдаём только строки с проблемами: чистые в таблице разбора не нужны,
    // а на десяти тысячах строк они утроили бы вес ответа.
    rows: withProblems,
    quota,
    caveats: caveats(input, targets, cache),
  };
}

/**
 * Что считаем запретом к выпуску.
 *
 * Список короткий намеренно: каждая запись здесь — это строка, которую
 * кнопка «Снять отметки с проблемных строк» уберёт из награждения. Ошибиться
 * в эту сторону хуже, чем недоглядеть: человек останется без грамоты,
 * и никто не заметит. Поэтому сюда попадает только то, что гарантированно
 * даёт брак: обрезанный текст, пустое обязательное поле и адрес, который
 * не является адресом.
 */
const BLOCKING = new Set(['overflow', 'required_empty', 'email_invalid']);

/**
 * Чего проверка не знает.
 *
 * Показывается рядом с отчётом. Проверка, молчащая о своих границах,
 * внушает больше доверия, чем заслуживает, — и человек перестаёт смотреть
 * на грамоты сам.
 */
function caveats(
  input: ValidationInput,
  targets: ReturnType<typeof fitTargets>,
  cache: FitCache,
): string[] {
  const out: string[] = [];

  if (!AWARDING_RULES_READY) out.push(AWARDING_RULES_CAVEAT);

  if (targets.length === 0) {
    out.push('В макете нет ни одного блока с переменными — проверять на переполнение нечего');
  }

  /*
   * Автомасштаб объявлен в схеме макета, но рендер его пока не применяет.
   * Пока это так, обещать «влезет после автомасштаба» нельзя — говорим прямо.
   */
  if (targets.some((t) => t.autoFit)) {
    out.push(
      'У некоторых блоков включён автомасштаб, но рендер его пока не применяет — ' +
        'текст на печати обрежется, а не уменьшится',
    );
  }

  if (targets.some((t) => t.substitutedFace)) {
    out.push(
      'Для части блоков нет точного начертания шрифта — ширина измерена по ближайшему ' +
        'и может быть занижена',
    );
  }

  const statics = staticOverflows(input.sheets);
  if (statics.length) {
    out.push(
      `Не влезает постоянный текст макета (${statics.length}): ` +
        `${statics.map((s) => `«${s.text.trim().slice(0, 40)}»`).join(', ')} — ` +
        'это одинаково для всех получателей и чинится в редакторе',
    );
  }

  if (cache.size === 0 && input.rows.length > 0 && targets.length > 0) {
    out.push('Ни в одной строке нет данных для блоков макета');
  }

  return out;
}

/**
 * Латиница вместо подменных кириллических букв.
 *
 * Чинит ровно тот случай, ради которого проверка и заведена: адрес
 * набирали в русской раскладке и не заметили. Буквы, у которых нет
 * латинского двойника, оставляем как есть — тогда исправление будет
 * видно неполным, и человек доправит сам, а не поверит молча.
 */
const LOOKALIKE: Record<string, string> = {
  а: 'a', А: 'A', в: 'b', В: 'B', с: 'c', С: 'C', е: 'e', Е: 'E', ё: 'e', Ё: 'E',
  к: 'k', К: 'K', м: 'm', М: 'M', н: 'h', Н: 'H', о: 'o', О: 'O', р: 'p', Р: 'P',
  т: 't', Т: 'T', у: 'y', У: 'Y', х: 'x', Х: 'X', і: 'i', ѕ: 's', ԁ: 'd',
};

function latinize(email: string): string | undefined {
  let out = '';
  let changed = false;
  for (const char of email) {
    const swap = LOOKALIKE[char];
    if (swap) {
      out += swap;
      changed = true;
    } else {
      out += char;
    }
  }
  // Если после замены остались русские буквы — подсказывать нечего:
  // догадка была бы хуже, чем её отсутствие.
  return changed && cyrillicInEmail(out).length === 0 ? out : undefined;
}

/** Самое частое в выгрузках: пробелы внутри адреса и запятая вместо точки. */
function repairEmail(email: string): string | undefined {
  const fixed = email.replace(/\s+/g, '').replace(/,/g, '.');
  return fixed !== email && looksLikeEmail(fixed) ? fixed : undefined;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(date);
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
