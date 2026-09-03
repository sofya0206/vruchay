import { SYSTEM_VARIABLE_NAMES } from '../variables';
import { textProps, VARIABLE_RE, type SheetLayout } from './layout';

/**
 * Готовые раскладки документа.
 *
 * Пустой лист и свободные блоки — плохая отправная точка: секретарь федерации
 * не типограф, и класть текст на глаз ему нечем. Поэтому композиция задаётся
 * здесь правилами, а человеку остаётся править слова.
 *
 * Раскладка не привязана к конкретному бланку: она ставит стопку строк по
 * центру свободного поля, поэтому одинаково ложится и на рамочную грамоту,
 * и на пустой лист.
 */

export type PresetKind =
  | 'award'
  | 'winner'
  | 'laureate'
  | 'participant'
  | 'attendee'
  | 'course'
  | 'graduate'
  | 'school'
  | 'thanks'
  | 'letter';
export type PresetStyle =
  'classic' | 'solemn' | 'academic' | 'strict' | 'modern' | 'script' | 'handwritten';

/**
 * Виды документов.
 *
 * Набор и названия — рыночный канон: те же виды продают типографии наградных
 * бланков (грамота, похвальная, диплом, благодарность, благодарственное
 * письмо) и предлагают конструкторы шаблонов. Придумывать свои названия
 * нельзя: секретарь ищет глазами слово, которым документ называется в приказе.
 */
export const PRESET_KINDS: {
  id: PresetKind;
  title: string;
  hint: string;
  group: string;
}[] = [
  {
    id: 'award',
    title: 'Грамота за место',
    hint: 'Соревнования, олимпиады, конкурсы',
    group: 'За результат',
  },
  {
    id: 'winner',
    title: 'Диплом победителя',
    hint: 'Первое место и победа в номинации',
    group: 'За результат',
  },
  {
    id: 'laureate',
    title: 'Диплом лауреата',
    hint: 'Творческие конкурсы и фестивали',
    group: 'За результат',
  },
  {
    id: 'participant',
    title: 'Диплом участника',
    hint: 'Всем, кто вышел на старт',
    group: 'За участие',
  },
  {
    id: 'attendee',
    title: 'Сертификат участника',
    hint: 'Конференции, мастер-классы, форумы',
    group: 'За участие',
  },
  {
    id: 'course',
    title: 'Сертификат об обучении',
    hint: 'Курсы и семинары, с объёмом часов',
    group: 'Обучение',
  },
  {
    id: 'graduate',
    title: 'Свидетельство об окончании',
    hint: 'Выпускникам программы',
    group: 'Обучение',
  },
  {
    id: 'school',
    title: 'Похвальная грамота',
    hint: 'Школьникам — за успехи в учёбе',
    group: 'Отличия и благодарности',
  },
  {
    id: 'thanks',
    title: 'Благодарность',
    hint: 'Судьям, тренерам, волонтёрам',
    group: 'Отличия и благодарности',
  },
  {
    id: 'letter',
    title: 'Благодарственное письмо',
    hint: 'Родителям, партнёрам, организациям',
    group: 'Отличия и благодарности',
  },
];

export const PRESET_STYLES: { id: PresetStyle; title: string; hint: string }[] = [
  { id: 'classic', title: 'Классический', hint: 'Засечки. Для наградных бланков с рамкой' },
  { id: 'solemn', title: 'Торжественный', hint: 'Крупные засечки вразрядку, для гербовых' },
  {
    id: 'academic',
    title: 'Академический',
    hint: 'Спокойные засечки, для дипломов и свидетельств',
  },
  { id: 'strict', title: 'Строгий', hint: 'Гротеск. Для минималистичных бланков' },
  { id: 'modern', title: 'Современный', hint: 'Геометричный гротеск, для корпоративных' },
  { id: 'script', title: 'Каллиграфия', hint: 'Рукописное имя пером' },
  { id: 'handwritten', title: 'Рукописный', hint: 'Живое перо, для детских и творческих' },
];

type Role = 'title' | 'label' | 'name' | 'meta' | 'main' | 'pair' | 'footer';

interface Row {
  role: Role;
  /**
   * Части строки. Часть выбрасывается, если её переменных нет в списке
   * получателей: «СШОР «Энергия» · г. Челябинск» превращается в «СШОР
   * «Энергия»», а не в строку с висящей точкой.
   */
  parts: string[];
  bold?: boolean;
}

const ROWS: Record<PresetKind, Row[]> = {
  award: [
    { role: 'title', parts: ['Грамота'] },
    { role: 'label', parts: ['Награждается'] },
    { role: 'name', parts: ['%name'] },
    { role: 'meta', parts: ['%team', '%city'] },
    { role: 'main', parts: ['за %place_word место'] },
    { role: 'main', parts: ['%event'], bold: true },
  ],
  participant: [
    { role: 'title', parts: ['Диплом'] },
    { role: 'label', parts: ['Награждается'] },
    { role: 'name', parts: ['%name'] },
    { role: 'meta', parts: ['%team', '%city'] },
    { role: 'main', parts: ['за участие в соревновании'] },
    { role: 'main', parts: ['%event'], bold: true },
  ],
  course: [
    { role: 'title', parts: ['Сертификат'] },
    { role: 'label', parts: ['Настоящий сертификат подтверждает, что'] },
    { role: 'name', parts: ['%name'] },
    { role: 'meta', parts: ['%team', '%city'] },
    { role: 'main', parts: ['%(прошёл|прошла) программу'] },
    { role: 'main', parts: ['%event'], bold: true },
    { role: 'pair', parts: ['в объёме %hours'] },
  ],
  winner: [
    { role: 'title', parts: ['Диплом'] },
    { role: 'label', parts: ['Награждается'] },
    { role: 'name', parts: ['%name'] },
    { role: 'meta', parts: ['%team', '%city'] },
    { role: 'main', parts: ['%(победитель|победительница)'] },
    { role: 'main', parts: ['%event'], bold: true },
  ],
  attendee: [
    { role: 'title', parts: ['Сертификат'] },
    { role: 'label', parts: ['Настоящий сертификат подтверждает, что'] },
    { role: 'name', parts: ['%name'] },
    { role: 'meta', parts: ['%team', '%city'] },
    { role: 'main', parts: ['%(принял|приняла) участие'] },
    { role: 'main', parts: ['%event'], bold: true },
    { role: 'pair', parts: ['%event_place', '%event_date'] },
  ],
  school: [
    { role: 'title', parts: ['Похвальная грамота'] },
    { role: 'label', parts: ['Награждается'] },
    { role: 'name', parts: ['%name'] },
    { role: 'meta', parts: ['%team', '%city'] },
    { role: 'main', parts: ['за отличные успехи в учёбе'] },
  ],
  laureate: [
    { role: 'title', parts: ['Диплом'] },
    { role: 'label', parts: ['Награждается'] },
    { role: 'name', parts: ['%name'] },
    { role: 'meta', parts: ['%team', '%city'] },
    { role: 'main', parts: ['лауреат'] },
    { role: 'main', parts: ['%event'], bold: true },
  ],
  graduate: [
    { role: 'title', parts: ['Свидетельство'] },
    { role: 'label', parts: ['Настоящее свидетельство подтверждает, что'] },
    { role: 'name', parts: ['%name'] },
    { role: 'meta', parts: ['%team', '%city'] },
    { role: 'main', parts: ['%(окончил|окончила) программу'] },
    { role: 'main', parts: ['%event'], bold: true },
    { role: 'pair', parts: ['в объёме %hours'] },
  ],
  letter: [
    { role: 'title', parts: ['Благодарственное письмо'] },
    { role: 'name', parts: ['%name'] },
    { role: 'meta', parts: ['%team', '%city'] },
    { role: 'main', parts: ['за помощь в организации и проведении'] },
    { role: 'main', parts: ['%event'], bold: true },
  ],
  thanks: [
    { role: 'title', parts: ['Благодарность'] },
    { role: 'label', parts: ['Объявляется'] },
    { role: 'name', parts: ['%name'] },
    { role: 'meta', parts: ['%team', '%city'] },
    { role: 'main', parts: ['за помощь в проведении'] },
    { role: 'main', parts: ['%event'], bold: true },
  ],
};

/**
 * Русские подписи к колонкам списка.
 *
 * Лишние колонки протокола — разряд, результат, тренер — идут в документ
 * парами «подпись: значение», как «Номинация: …» на типовых дипломах.
 * Колонки, для которых человеческого названия нет (транслит вроде «ochki»),
 * в документ не попадают: «Ochki: 12» на грамоте выглядит как ошибка.
 */
const PAIR_LABELS: Record<string, string> = {
  result: 'с результатом',
  category: 'Разряд',
  coach: 'Тренер',
  event_place: 'Место проведения',
  number: 'Номер',
};

/** Больше двух дополнительных строк превращают грамоту в анкету. */
const MAX_PAIRS = 2;

interface StyleSpec {
  labelFont: string;
  nameFont: string;
  bodyFont: string;
  /** цвет подводки и линейки */
  accent: string;
  /** цвет основного текста */
  ink: string;
  nameInk: string;
  nameItalic?: boolean;
}

const STYLES: Record<PresetStyle, StyleSpec> = {
  classic: {
    labelFont: 'PT Serif',
    nameFont: 'Playfair Display',
    bodyFont: 'PT Serif',
    accent: '#8B2020',
    ink: '#4A3628',
    nameInk: '#7A1E1E',
  },
  solemn: {
    labelFont: 'Playfair Display',
    nameFont: 'Playfair Display',
    bodyFont: 'Lora',
    accent: '#8A6A22',
    ink: '#3F3524',
    nameInk: '#6E2B1B',
  },
  academic: {
    labelFont: 'Lora',
    nameFont: 'Lora',
    bodyFont: 'Lora',
    accent: '#2F4A6B',
    ink: '#33383F',
    nameInk: '#1F2A38',
  },
  modern: {
    labelFont: 'Montserrat',
    nameFont: 'Montserrat',
    bodyFont: 'Inter',
    accent: '#2C6E63',
    ink: '#2B2F33',
    nameInk: '#1A1D20',
  },
  handwritten: {
    labelFont: 'PT Sans',
    nameFont: 'Caveat',
    bodyFont: 'PT Sans',
    accent: '#B0562A',
    ink: '#43413C',
    nameInk: '#8A3E1E',
  },
  strict: {
    labelFont: 'PT Sans',
    nameFont: 'PT Sans',
    bodyFont: 'PT Sans',
    accent: '#A8762F',
    ink: '#3C3C3C',
    nameInk: '#1F1F1F',
  },
  script: {
    labelFont: 'PT Serif',
    nameFont: 'Marck Script',
    bodyFont: 'PT Serif',
    accent: '#8B2020',
    ink: '#4A3628',
    nameInk: '#6E2B1B',
  },
};

/**
 * Свободное поле бланка в долях страницы.
 * Умолчание рассчитано на типовой наградной бланк: рамка по краям и
 * напечатанное слово «ГРАМОТА» сверху.
 */
export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_SAFE_AREA: SafeArea = { top: 0.34, right: 0.15, bottom: 0.16, left: 0.15 };

/** Бланк без напечатанного заголовка: поле начинается выше, там встанет свой. */
export const TITLED_SAFE_AREA: SafeArea = { top: 0.14, right: 0.13, bottom: 0.1, left: 0.13 };

/**
 * Оптическая поправка: блок, стоящий ровно по геометрическому центру,
 * глазу кажется съехавшим вниз. Поднимаем на долю высоты листа.
 */
const OPTICAL_LIFT = 0.025;

/**
 * Кегли ролей друг относительно друга, где имя — единица.
 *
 * Абсолютных размеров здесь нет намеренно: композиция должна заполнять
 * свободное поле бланка, а не быть фиксированной долей листа. Иначе на
 * бланке с широкой рамкой текст плавает в пустоте и выглядит мелким,
 * хотя формально «правильного» размера.
 */
const SIZE_OF_NAME: Record<Role, number> = {
  title: 0.72,
  label: 0.3,
  name: 1,
  meta: 0.26,
  main: 0.42,
  pair: 0.3,
  footer: 0.24,
};

/** Какую часть высоты свободного поля занимает стопка целиком. */
const FIELD_FILL = 0.8;

/** Крупнее этого имя выглядит криком даже на большом бланке. */
const NAME_MAX_OF_WIDTH = 0.13;
/** Мельче — нечитаемо на печати. */
const NAME_MIN_MM = 6;

/** Высота блока в долях от его кегля. У имени — две строки про запас. */
const HEIGHT_OF_SIZE: Record<Role, number> = {
  title: 1.5,
  label: 1.8,
  name: 2.5,
  meta: 1.5,
  main: 1.5,
  pair: 1.5,
  footer: 1.6,
};

/** Отступ снизу от строки этой роли, в долях её кегля. */
const GAP_AFTER: Record<Role, number> = {
  title: 1.2,
  label: 0.5,
  name: 0.4,
  meta: 1.4,
  main: 0.25,
  pair: 0.3,
  footer: 0,
};

const MM_TO_PT = 72 / 25.4;

/** Цвета, снятые с бланка: ими перекрываются цвета стиля. */
export interface PresetPalette {
  ink: string;
  accent: string;
  /** Имя — приглушённый тон краски бланка, а не сама краска. */
  nameInk?: string;
}

export interface PresetContext {
  pageWidthMm: number;
  pageHeightMm: number;
  /** имена колонок списка получателей */
  columns: string[];
  safeArea?: SafeArea;
  /**
   * Цвета бланка. Чёрный текст на кремовой грамоте выглядит наклейкой,
   * поэтому по умолчанию берём краски самой картинки, а цвета стиля
   * остаются запасным вариантом для бланка без выраженной палитры.
   */
  palette?: PresetPalette;
  /**
   * На бланке уже напечатано слово «Грамота» — тогда своего заголовка не ставим.
   * У наградных бланков он есть почти всегда, поэтому это умолчание.
   */
  titlePrinted?: boolean;
}

function variablesOf(text: string): string[] {
  return [...text.matchAll(VARIABLE_RE)].map((m) => m[1]);
}

/** Собирает строку из частей, выбрасывая те, для которых нет данных. */
function buildText(parts: string[], available: Set<string>): string {
  const kept = parts.filter((part) => variablesOf(part).every((v) => available.has(v)));
  return kept.join(' · ');
}

export function buildPreset(kind: PresetKind, style: PresetStyle, ctx: PresetContext): SheetLayout {
  const base = STYLES[style];
  const spec: StyleSpec = ctx.palette
    ? {
        ...base,
        accent: ctx.palette.accent,
        ink: ctx.palette.ink,
        nameInk: ctx.palette.nameInk ?? ctx.palette.accent,
      }
    : base;
  const titlePrinted = ctx.titlePrinted ?? true;
  // Свой заголовок занимает верх листа — значит и поле начинается выше.
  const area = ctx.safeArea ?? (titlePrinted ? DEFAULT_SAFE_AREA : TITLED_SAFE_AREA);
  const available = new Set([...SYSTEM_VARIABLE_NAMES, ...ctx.columns]);
  /*
   * Производные переменные живут, только пока есть колонка-источник:
   * «за первое место» без колонки «место» превратится в «за  место».
   */
  if (!ctx.columns.includes('place')) available.delete('place_word');
  if (!ctx.columns.includes('name')) {
    available.delete('name_dat');
    available.delete('name_lat_gost');
    available.delete('name_lat_icao');
  }

  const rows: (Row & { text: string })[] = ROWS[kind]
    .filter((row) => row.role !== 'title' || !titlePrinted)
    .map((row) => ({ ...row, text: buildText(row.parts, available) }))
    .filter((row) => row.text !== '');

  // Колонки, которых нет в самой композиции, добавляем парами «подпись: значение».
  const used = new Set(rows.flatMap((row) => variablesOf(row.text)));
  for (const column of ctx.columns) {
    if (rows.filter((r) => r.role === 'pair').length >= MAX_PAIRS) break;
    const label = PAIR_LABELS[column];
    if (!label || used.has(column)) continue;
    rows.push({ role: 'pair', parts: [], text: `${label}: %${column}` });
  }

  const fieldWidth = ctx.pageWidthMm * (1 - area.left - area.right);
  const regionTop = ctx.pageHeightMm * area.top;
  const regionHeight = ctx.pageHeightMm * (1 - area.top - area.bottom);

  /*
   * Сначала считаем стопку в долях кегля имени, потом подбираем сам кегль так,
   * чтобы она заняла нужную часть свободного поля. Так композиция одинаково
   * смотрится и на A5, и на бланке с широкой рамкой: меняется поле — меняется
   * весь набор размеров разом, а пропорции между строками остаются.
   */
  const stackUnits = rows.reduce((sum, row, i) => {
    const size = SIZE_OF_NAME[row.role];
    const gap = i === rows.length - 1 ? 0 : size * GAP_AFTER[row.role];
    return sum + size * HEIGHT_OF_SIZE[row.role] + gap;
  }, 0);

  /*
   * Полосу под подпись закладываем до расчёта размеров. Иначе стопка
   * занимает всё поле, подписи не остаётся места, и она просто исчезает —
   * а документ без подписи не документ.
   */
  const FOOTER_UNITS = SIZE_OF_NAME.footer * HEIGHT_OF_SIZE.footer * 2.4;
  const units = stackUnits + FOOTER_UNITS;

  const nameMm = Math.min(
    Math.max((regionHeight * FIELD_FILL) / units, NAME_MIN_MM),
    ctx.pageWidthMm * NAME_MAX_OF_WIDTH,
  );
  const sizeMm = (role: Role) => nameMm * SIZE_OF_NAME[role];

  const heights = rows.map((row) => sizeMm(row.role) * HEIGHT_OF_SIZE[row.role]);
  const gaps = rows.map((row, i) =>
    i === rows.length - 1 ? 0 : sizeMm(row.role) * GAP_AFTER[row.role],
  );
  const stackHeight = heights.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
  // Стопку центруем в поле за вычетом полосы подписи — иначе она наедет на неё.
  const footerBand = nameMm * FOOTER_UNITS;
  const startY = Math.max(
    regionTop,
    regionTop + (regionHeight - footerBand - stackHeight) / 2 - ctx.pageHeightMm * OPTICAL_LIFT,
  );

  const layout: SheetLayout = [];
  let y = startY;

  rows.forEach((row, index) => {
    layout.push(
      textElement(`preset-${kind}-${index}`, index, {
        x: ctx.pageWidthMm * area.left,
        y,
        w: fieldWidth,
        h: heights[index],
        size: sizeMm(row.role),
        role: row.role,
        text: row.text,
        bold: row.bold ?? false,
        align: 'center',
        spec,
      }),
    );
    y += heights[index] + gaps[index];
  });

  /*
   * Подвал стоит не в стопке, а прижат к низу поля: подписант слева, дата
   * справа — так он выглядит на любом настоящем дипломе. В стопке они
   * уезжали бы вверх вслед за длинным именем.
   */
  /*
   * Подвал настоящего диплома устроен так: слева должность подписанта,
   * справа его фамилия, ниже по центру — дата выдачи и кто выдал.
   * Так подписывают приказом, и подпись человек ищет именно там.
   */
  const footerSize = sizeMm('footer');
  const footerHeight = footerSize * HEIGHT_OF_SIZE.footer;
  const bottom = ctx.pageHeightMm * (1 - area.bottom);
  const signY = bottom - footerHeight * 2.4;
  const issuedY = bottom - footerHeight;
  const half = fieldWidth / 2 - footerSize;

  if (signY > y) {
    layout.push(
      textElement(`preset-${kind}-signer-role`, rows.length, {
        x: ctx.pageWidthMm * area.left,
        y: signY,
        w: half,
        h: footerHeight,
        size: footerSize,
        role: 'footer',
        text: '%signer_role',
        bold: false,
        align: 'left',
        spec,
      }),
      textElement(`preset-${kind}-signer-name`, rows.length + 1, {
        x: ctx.pageWidthMm * (1 - area.right) - half,
        y: signY,
        w: half,
        h: footerHeight,
        size: footerSize,
        role: 'footer',
        text: '%signer_name',
        bold: false,
        align: 'right',
        spec,
      }),
      textElement(`preset-${kind}-issued`, rows.length + 2, {
        x: ctx.pageWidthMm * area.left,
        y: issuedY,
        w: fieldWidth,
        h: footerHeight,
        size: footerSize,
        role: 'footer',
        text: '%date · %org',
        bold: false,
        align: 'center',
        spec,
      }),
    );
  }

  return layout;
}

function textElement(
  id: string,
  z: number,
  o: {
    x: number;
    y: number;
    w: number;
    h: number;
    size: number;
    role: Role;
    text: string;
    bold: boolean;
    align: 'left' | 'center' | 'right';
    spec: StyleSpec;
  },
): SheetLayout[number] {
  const { role, spec } = o;
  const isName = role === 'name';
  const isTitle = role === 'title';

  /*
   * Через разбор, а не литералом: умолчания новых свойств живут в схеме,
   * и заготовка обязана получить ровно те же, что получил бы блок,
   * вставленный руками. Текст отдаём в прежнем плоском виде — разбор сам
   * превращает «%name» в поля, и это та же дорога, которой идут старые
   * сохранённые макеты.
   */
  return {
    id,
    type: 'text',
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    rotation: 0,
    z,
    opacity: 1,
    locked: false,
    hidden: false,
    groupId: null,
    name: null,
    props: textProps.parse({
      text: o.text,
      fontFamily: isName
        ? spec.nameFont
        : isTitle || role === 'label'
          ? spec.labelFont
          : spec.bodyFont,
      fontSize: Number((o.size * MM_TO_PT).toFixed(1)),
      color: isName ? spec.nameInk : isTitle || role === 'label' ? spec.accent : spec.ink,
      align: o.align,
      lineHeight: isName ? 1.15 : 1.3,
      letterSpacing: role === 'label' || isTitle ? Number((o.size * 0.1 * MM_TO_PT).toFixed(2)) : 0,
      bold: o.bold || isTitle,
      italic: isName ? (spec.nameItalic ?? false) : false,
      uppercase: role === 'label',
      autoFit: true,
    }),
  };
}
