import { isUnparsablePlace, parsePlace, placeMatches } from './place';
import type { PlaceRange } from './place';
import { parseStatus } from './status';
import { AWARD_RULES_SCHEMA_VERSION, isFallbackRule } from './rules';
import type { AwardCondition, AwardRule, AwardRuleSet } from './rules';

/**
 * Применение набора правил к таблице получателей.
 *
 * Здесь нет ни базы, ни запросов: на вход строки, на выход план. Так его
 * можно считать и на сервере перед выпуском, и в браузере, пока человек
 * ещё правит правила, — одним и тем же кодом, без расхождения превью
 * с тем, что действительно выйдет.
 *
 * План сериализуем целиком и намеренно самодостаточен: в нём хранятся
 * не только идентификаторы, но и подписи правил и названия шаблонов на
 * момент расчёта. Реестр выданного, сохранив снимок плана, обязан
 * показывать то, что выдали тогда, а не то, что показали бы сегодняшние
 * правила: правила меняют между соревнованиями, награждение задним
 * числом не меняется.
 */

/** Строка таблицы получателей — ровно то, что нужно движку. */
export interface AwardPlanRow {
  id: string;
  /** Позиция в таблице, от нуля, как в RecipientRow. */
  position: number;
  data: Record<string, string>;
}

export interface AwardPlanInput {
  ruleSet: AwardRuleSet;
  rows: AwardPlanRow[];
  /**
   * Названия документов-шаблонов: идентификатор → заголовок. Отсутствие
   * идентификатора в этом словаре означает, что шаблон удалён или
   * принадлежит другой организации, — движок сообщит об этом отдельно
   * и документ по такому правилу не запланирует.
   */
  templateTitles: Record<string, string>;
  /** Колонка с ФИО: нужна, чтобы отчёт был поимённым, а не «три строки». */
  nameColumn?: string;
}

/** Один запланированный документ. */
export interface AwardPlanItem {
  rowId: string;
  /** Номер строки, как её видит человек в таблице, с единицы. */
  rowNumber: number;
  group: string | null;
  /** Кому: ФИО участника или значение колонки получателя (имя тренера). */
  subject: string;
  templateDocumentId: string;
  templateTitle: string;
  ruleId: string;
  ruleLabel: string;
  /** Подпись выхода: «Благодарность тренеру». Пусто — берём название шаблона. */
  outputLabel: string;
  /**
   * Строки, слитые в этот документ дедупликацией. Одна благодарность
   * тренеру на пятерых призёров — здесь остальные четыре строки, чтобы
   * никто не исчез из отчёта без следа.
   */
  mergedRowIds: string[];
}

export type AwardIssueCode =
  /** Ни одно правило не совпало: строку никто не рассмотрел. */
  | 'no-rule'
  /** Правило «не выдавать» сработало — решение принято, но его надо видеть. */
  | 'excluded-by-rule'
  /** Колонка группы выбрана, а в строке она пуста: место окажется «по всему файлу». */
  | 'missing-group'
  /** В графе места что-то написано, но разобрать не удалось. */
  | 'unparsable-place'
  /** В графе статуса что-то написано, но это не известный статус. */
  | 'unknown-status'
  /** Шаблон правила удалён или недоступен. */
  | 'no-template'
  /** Получателя брать неоткуда: колонка тренера в этой строке пуста. */
  | 'empty-subject'
  /** Несколько строк дали одного получателя — документ у них будет общий. */
  | 'duplicate-subject';

/**
 * Замечание по строке — единственный способ, которым строка может остаться
 * без документа и при этом не пропасть.
 *
 * Список плоский и сериализуемый: он рассчитан на то, что проверка пакета
 * возьмёт его как есть, отфильтрует по severity и сгруппирует по code.
 * Никаких ссылок на объекты и никакой логики внутри — только данные.
 */
export interface AwardPlanIssue {
  code: AwardIssueCode;
  /** error мешает выпуску, warning — нет, но человек должен это увидеть. */
  severity: 'error' | 'warning';
  rowId: string;
  rowNumber: number;
  group: string | null;
  /** ФИО из строки: отчёт должен быть поимённым. Больше ПДн здесь не нужно. */
  subject: string;
  /** Готовое к показу объяснение по-русски. */
  message: string;
  /** Правило, принявшее решение, если решение было. */
  ruleId?: string;
}

/** Строка превью раскладки: «Диплом победителя — 12». */
export interface AwardPlanSummary {
  templateDocumentId: string;
  templateTitle: string;
  /** Какими правилами набрано — для расшифровки числа. */
  ruleLabels: string[];
  count: number;
}

export interface AwardPlan {
  schemaVersion: number;
  items: AwardPlanItem[];
  summary: AwardPlanSummary[];
  issues: AwardPlanIssue[];
  totals: {
    /** Сколько строк рассмотрено. */
    rows: number;
    /** По скольким строкам выдаётся хоть один документ. */
    issuingRows: number;
    /** Сколько строк снято правилом «не выдавать». */
    excludedRows: number;
    /** Сколько строк не подошло ни под одно правило. */
    unmatchedRows: number;
    /** Сколько строк остановлено ошибкой до правил — например, непонятным статусом. */
    blockedRows: number;
    /** Сколько документов выйдет после дедупликации. */
    documents: number;
    /** Сколько документов дедупликация сэкономила. */
    deduplicated: number;
  };
}

const DEFAULT_NAME_COLUMN = 'name';

/**
 * Разделитель частей ключа дедупликации. Нулевой символ, а не дефис:
 * в названии группы и в имени тренера может встретиться что угодно,
 * и склейка через обычный знак дала бы совпадение разных ключей.
 */
const KEY_SEPARATOR = '\u0000';

/** Значения сравниваем без учёта регистра и краевых пробелов: так их и вводят. */
function norm(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

/**
 * Что известно о строке в момент проверки условий.
 *
 * Место приходит отсюда, а не из ячейки напрямую: у условия с признаком
 * «внутри группы» оно посчитано среди строк той же группы, а у обычного
 * взято как написано.
 */
interface RowContext {
  data: Record<string, string>;
  /** Место строки в её группе по этой колонке. null — места нет. */
  rankIn: (field: string) => PlaceRange | null;
}

function placeOf(condition: AwardCondition, ctx: RowContext): PlaceRange | null {
  const withinGroup = 'withinGroup' in condition && condition.withinGroup;
  return withinGroup ? ctx.rankIn(condition.field) : parsePlace(ctx.data[condition.field] ?? '');
}

function conditionMatches(condition: AwardCondition, ctx: RowContext): boolean {
  const data = ctx.data;
  const raw = data[condition.field] ?? '';

  switch (condition.op) {
    case 'equals':
      return norm(raw) === norm(condition.value);
    case 'notEquals':
      return norm(raw) !== norm(condition.value);
    case 'oneOf':
      return condition.value.some((v) => norm(v) === norm(raw));
    case 'contains':
      return norm(raw).includes(norm(condition.value));
    case 'filled':
      return raw.trim() !== '';
    case 'empty':
      return raw.trim() === '';
    case 'placeEquals': {
      const place = placeOf(condition, ctx);
      return place !== null && placeMatches(place, condition.value, condition.value);
    }
    case 'placeBetween': {
      const place = placeOf(condition, ctx);
      return place !== null && placeMatches(place, condition.value.from, condition.value.to);
    }
    case 'statusIn': {
      const status = parseStatus(raw);
      return status !== null && condition.value.includes(status);
    }
  }
}

function ruleMatches(rule: AwardRule, ctx: RowContext): boolean {
  // Правило без условий срабатывает всегда — это «иначе» в конце списка.
  if (isFallbackRule(rule)) return true;
  return rule.match === 'any'
    ? rule.conditions.some((c) => conditionMatches(c, ctx))
    : rule.conditions.every((c) => conditionMatches(c, ctx));
}

/** Колонки, которые хоть одно правило читает как место. */
function placeFieldsOf(rules: AwardRule[]): string[] {
  const fields = new Set<string>();
  for (const rule of rules) {
    for (const condition of rule.conditions) {
      if (condition.op === 'placeEquals' || condition.op === 'placeBetween') {
        fields.add(condition.field);
      }
    }
  }
  return [...fields];
}

/** Колонки, место в которых надо пересчитать внутри группы. */
function withinGroupFieldsOf(rules: AwardRule[]): string[] {
  const fields = new Set<string>();
  for (const rule of rules) {
    for (const condition of rule.conditions) {
      if (
        (condition.op === 'placeEquals' || condition.op === 'placeBetween') &&
        condition.withinGroup
      ) {
        fields.add(condition.field);
      }
    }
  }
  return [...fields];
}

/** Ключ группы строки. Пустая колонка группы — весь протокол одна группа. */
function groupKeyOf(data: Record<string, string>, groupColumn: string): string {
  return groupColumn ? (data[groupColumn] ?? '').trim() : '';
}

function samePlace(a: PlaceRange, b: PlaceRange): boolean {
  return a.from === b.from && a.to === b.to;
}

/**
 * Место каждой строки внутри её группы.
 *
 * Считаем спортивным порядком: при делёжке обе строки получают один
 * диапазон, а следующий за ними — место, сдвинутое на число поделивших.
 * Двое первых — это «1-2», и третий получает третье место, а не второе.
 *
 * Снятых в порядок не берём: дисквалифицированный, оставшийся во второй
 * строке протокола, сдвинул бы настоящего призёра на ступень вниз. Строки
 * с нераспознанным статусом, наоборот, оставляем — про них мы ничего
 * не знаем, и вычёркивать их значило бы менять чужие места по догадке.
 */
function computeGroupRanks(
  rows: AwardPlanRow[],
  field: string,
  groupColumn: string,
  statusColumn: string,
): Map<string, PlaceRange> {
  const byGroup = new Map<string, { id: string; place: PlaceRange }[]>();

  for (const row of rows) {
    const data = row.data ?? {};
    if (statusColumn) {
      const status = parseStatus(data[statusColumn] ?? '');
      if (status !== null && status !== 'ok') continue;
    }
    const place = parsePlace(data[field] ?? '');
    if (place === null) continue;

    const key = groupKeyOf(data, groupColumn);
    const list = byGroup.get(key) ?? [];
    list.push({ id: row.id, place });
    byGroup.set(key, list);
  }

  const ranks = new Map<string, PlaceRange>();
  for (const list of byGroup.values()) {
    list.sort((a, b) => a.place.from - b.place.from || a.place.to - b.place.to);
    let position = 1;
    for (let i = 0; i < list.length; ) {
      let j = i;
      while (j < list.length && samePlace(list[i].place, list[j].place)) j++;
      const count = j - i;
      const rank: PlaceRange = { from: position, to: position + count - 1, shared: count > 1 };
      for (let k = i; k < j; k++) ranks.set(list[k].id, rank);
      position += count;
      i = j;
    }
  }
  return ranks;
}

export function applyAwardRules(input: AwardPlanInput): AwardPlan {
  const { ruleSet, rows, templateTitles } = input;
  const nameColumn = input.nameColumn ?? DEFAULT_NAME_COLUMN;

  const rules = [...ruleSet.rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.position - b.position);
  const placeFields = placeFieldsOf(rules);

  // Места внутри групп считаем один раз на весь протокол: они зависят
  // от всех строк сразу, а не от той, которую разбираем.
  const ranksByField = new Map<string, Map<string, PlaceRange>>();
  for (const field of withinGroupFieldsOf(rules)) {
    ranksByField.set(
      field,
      computeGroupRanks(rows, field, ruleSet.groupColumn, ruleSet.statusColumn),
    );
  }

  /** Группа влияет на исход только там, где её кто-то читает. */
  const groupMatters =
    ranksByField.size > 0 ||
    rules.some((r) => r.outputs.some((o) => o.subjectColumn && o.dedupeScope === 'group'));

  const items: AwardPlanItem[] = [];
  const issues: AwardPlanIssue[] = [];
  /** Ключ дедупликации → уже запланированный документ. */
  const seen = new Map<string, AwardPlanItem>();
  /** Те ключи, по которым склейка действительно произошла. */
  const merges = new Map<string, AwardPlanItem>();

  let issuingRows = 0;
  let excludedRows = 0;
  let unmatchedRows = 0;
  let blockedRows = 0;
  let deduplicated = 0;

  const rowNumberById = new Map(rows.map((r) => [r.id, r.position + 1]));

  for (const row of rows) {
    const rowNumber = row.position + 1;
    const data = row.data ?? {};
    const group = ruleSet.groupColumn ? (data[ruleSet.groupColumn] ?? '').trim() || null : null;
    const subject = (data[nameColumn] ?? '').trim();
    const context = { rowId: row.id, rowNumber, group, subject };
    const ctx: RowContext = {
      data,
      rankIn: (field) => ranksByField.get(field)?.get(row.id) ?? null,
    };

    if (ruleSet.groupColumn && group === null && groupMatters) {
      issues.push({
        ...context,
        code: 'missing-group',
        severity: 'warning',
        message:
          `Не заполнена колонка группы «${ruleSet.groupColumn}» — ` +
          'строка попадает в общую группу «без группы» вместе со всеми такими же',
      });
    }

    /*
     * Нераспознанный статус останавливает выдачу.
     *
     * Раньше здесь было предупреждение, а строка шла дальше и подхватывалась
     * правилом «иначе». То есть DSQ, записанный нестандартно, оборачивался
     * грамотой снятому спортсмену — при формально выданном предупреждении,
     * которое никто не читал, потому что документы уже напечатаны.
     * Из двух исходов «человек разберётся с одной строкой» и «снятый выходит
     * на сцену за грамотой» выбираем первый.
     */
    if (ruleSet.statusColumn) {
      const rawStatus = data[ruleSet.statusColumn] ?? '';
      if (rawStatus.trim() !== '' && parseStatus(rawStatus) === null) {
        blockedRows++;
        issues.push({
          ...context,
          code: 'unknown-status',
          severity: 'error',
          message:
            `Статус «${rawStatus.trim()}» не распознан — документ не выдаётся. ` +
            'Впишите понятную отметку (DSQ, DNS, DNF, «снят») или очистите графу',
        });
        continue;
      }
    }

    // Место разбираем один раз на строку, а не по разу на каждое правило,
    // которое в неё заглянуло: иначе о нечитаемой графе сообщим трижды.
    for (const field of placeFields) {
      const rawPlace = data[field] ?? '';
      if (isUnparsablePlace(rawPlace)) {
        issues.push({
          ...context,
          code: 'unparsable-place',
          severity: 'warning',
          message: `Не удалось разобрать место «${rawPlace.trim()}» в колонке «${field}»`,
        });
      }
    }

    const rule = rules.find((r) => ruleMatches(r, ctx));

    if (!rule) {
      unmatchedRows++;
      issues.push({
        ...context,
        code: 'no-rule',
        severity: 'error',
        message:
          'Не подошло ни одно правило — документ не выйдет. Добавьте правило ' +
          'или поставьте в конец списка правило без условий',
      });
      continue;
    }

    if (rule.action === 'skip') {
      excludedRows++;
      issues.push({
        ...context,
        code: 'excluded-by-rule',
        severity: 'warning',
        ruleId: rule.id,
        message: `Документ не выдаётся по правилу «${rule.label || 'без названия'}»`,
      });
      continue;
    }

    let issuedForRow = 0;
    for (const output of rule.outputs) {
      const templateTitle = templateTitles[output.templateDocumentId];
      if (templateTitle === undefined) {
        issues.push({
          ...context,
          code: 'no-template',
          severity: 'error',
          ruleId: rule.id,
          message:
            `Шаблон правила «${rule.label || 'без названия'}» недоступен: ` +
            'он удалён или лежит в корзине',
        });
        continue;
      }

      // Получатель: сам участник или тот, кто указан в колонке (тренер, команда).
      const outSubject = output.subjectColumn ? (data[output.subjectColumn] ?? '').trim() : subject;

      if (output.subjectColumn && outSubject === '') {
        issues.push({
          ...context,
          code: 'empty-subject',
          severity: 'error',
          ruleId: rule.id,
          message:
            `Колонка «${output.subjectColumn}» в этой строке пуста — ` +
            `некому выдавать документ по правилу «${rule.label || 'без названия'}»`,
        });
        continue;
      }

      /*
       * Дедуплицируем только тех получателей, которые взяты из колонки.
       * Сам участник дедупликации не подлежит: два полных однофамильца
       * в одном протоколе — редкость, но своя грамота нужна каждому,
       * и склеить их значило бы одного из двух оставить без документа.
       */
      const dedupeKey = output.subjectColumn
        ? [
            output.templateDocumentId,
            output.subjectColumn,
            output.dedupeScope === 'group' ? (group ?? '') : '',
            norm(outSubject),
          ].join(KEY_SEPARATOR)
        : null;

      if (dedupeKey !== null) {
        const existing = seen.get(dedupeKey);
        if (existing) {
          existing.mergedRowIds.push(row.id);
          merges.set(dedupeKey, existing);
          deduplicated++;
          issuedForRow++;
          continue;
        }
      }

      const item: AwardPlanItem = {
        rowId: row.id,
        rowNumber,
        group,
        subject: outSubject,
        templateDocumentId: output.templateDocumentId,
        templateTitle,
        ruleId: rule.id,
        ruleLabel: rule.label,
        outputLabel: output.label || templateTitle,
        mergedRowIds: [],
      };
      items.push(item);
      if (dedupeKey !== null) seen.set(dedupeKey, item);
      issuedForRow++;
    }

    if (issuedForRow > 0) issuingRows++;
  }

  /*
   * Про каждую склейку сообщаем отдельно.
   *
   * Ключ дедупликации — нормализованное имя, и различить двух разных
   * тренеров, записанных одинаково («Иванов И. И.»), по нему невозможно.
   * Ключ мы намеренно оставляем таким: пять призёров одного тренера — это
   * одна благодарность, и так и должно быть. Но второй Иванов, оставшийся
   * без документа, обязан быть виден, а не исчезать в разнице между
   * «строк 17» и «документов 16».
   */
  for (const item of merges.values()) {
    const rowNumbers = [item.rowNumber, ...item.mergedRowIds.map((id) => rowNumberById.get(id) ?? 0)]
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    issues.push({
      rowId: item.rowId,
      rowNumber: item.rowNumber,
      group: item.group,
      subject: item.subject,
      code: 'duplicate-subject',
      severity: 'warning',
      ruleId: item.ruleId,
      message:
        `«${item.subject}» встречается в строках ${rowNumbers.join(', ')} — ` +
        `документ «${item.templateTitle}» будет один на всех. ` +
        'Если это разные люди с одинаковым написанием, второй останется без документа',
    });
  }

  return {
    schemaVersion: ruleSet.schemaVersion || AWARD_RULES_SCHEMA_VERSION,
    items,
    summary: buildSummary(items),
    issues,
    totals: {
      rows: rows.length,
      issuingRows,
      excludedRows,
      unmatchedRows,
      blockedRows,
      documents: items.length,
      deduplicated,
    },
  };
}

/** Превью раскладки: «Диплом победителя — 12, Грамота участника — 84». */
export function buildSummary(items: AwardPlanItem[]): AwardPlanSummary[] {
  const byTemplate = new Map<string, AwardPlanSummary>();

  for (const item of items) {
    let row = byTemplate.get(item.templateDocumentId);
    if (!row) {
      row = {
        templateDocumentId: item.templateDocumentId,
        templateTitle: item.templateTitle,
        ruleLabels: [],
        count: 0,
      };
      byTemplate.set(item.templateDocumentId, row);
    }
    row.count++;
    if (item.ruleLabel && !row.ruleLabels.includes(item.ruleLabel)) {
      row.ruleLabels.push(item.ruleLabel);
    }
  }

  return [...byTemplate.values()].sort((a, b) => b.count - a.count);
}

/**
 * Только те замечания, из-за которых документ не выйдет.
 *
 * Отдельная функция, а не фильтр по месту вызова: проверка пакета, реестр
 * и превью должны понимать «мешает выпуску» одинаково.
 */
export function blockingIssues(plan: AwardPlan): AwardPlanIssue[] {
  return plan.issues.filter((i) => i.severity === 'error');
}
