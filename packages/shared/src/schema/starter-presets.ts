import { CURRENT_LAYOUT_SCHEMA_VERSION, type SheetLayout } from './layout';

/**
 * Готовые заготовки: вид документа плюс расставленный по листу текст.
 *
 * Пустой лист — плохая отправная точка. Секретарь федерации не типограф,
 * и класть текст на глаз ему нечем: он открывает редактор, видит белое поле
 * и закрывает вкладку. Заготовка даёт готовую композицию, в которой остаётся
 * поправить слова.
 *
 * Композиция не привязана к конкретному бланку: стопка строк центруется
 * в свободном поле листа, поэтому одинаково ложится и на рамочную грамоту
 * с гербом, и на чистый лист.
 *
 * Почему заготовок четыре, а не семьдесят: в ветке `layout-editor` лежит
 * `presets.ts` на десять видов в семи стилях, но он написан под другую
 * версию контракта макета — там свой синтаксис родовых форм `%(муж|жен)`
 * и свои служебные переменные подписанта. На текущей схеме он дал бы
 * на бумаге «%(прошёл) программу» вместо слова. Тот файл лежит рядом
 * нетронутым и подключится вместе со своей веткой; здесь — заготовки,
 * написанные под контракт, который действует сегодня.
 */

/**
 * Раздел библиотеки — по типу мероприятия, а не по виду бумаги.
 *
 * Человек приходит с задачей «наградить победителей соревнования»,
 * а не «выпустить документ вида диплом». Поэтому на входе спрашиваем
 * про мероприятие, а вид документа он выбирает уже внутри раздела.
 */
export type DocumentCategory = 'sport' | 'contest' | 'education' | 'corporate' | 'accreditation';

export const DOCUMENT_CATEGORIES: { id: DocumentCategory; title: string; hint: string }[] = [
  { id: 'sport', title: 'Спортивные соревнования', hint: 'Грамоты и дипломы за места' },
  { id: 'contest', title: 'Олимпиады и конкурсы', hint: 'Победителям, призёрам, участникам' },
  { id: 'education', title: 'Обучение и семинары', hint: 'Сертификаты о прохождении' },
  { id: 'corporate', title: 'Корпоративные благодарности', hint: 'Сотрудникам и партнёрам' },
  {
    id: 'accreditation',
    title: 'Аккредитации и пропуска',
    hint: 'Бейджи и карточки участников',
  },
];

export const DOCUMENT_CATEGORY_IDS = DOCUMENT_CATEGORIES.map((c) => c.id) as DocumentCategory[];

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORY_IDS as string[]).includes(value);
}

export type StarterPresetId =
  | 'sport-award'
  | 'contest-participant'
  | 'course-certificate'
  | 'corporate-thanks';

export interface StarterPreset {
  id: StarterPresetId;
  title: string;
  hint: string;
  category: DocumentCategory;
  /** Название нового материала, пока человек не переименовал его сам. */
  documentTitle: string;
  /**
   * Колонки списка получателей, без которых заготовка печатает пустоту.
   * «place» нужен грамоте за место: без него `%place_word` подставит
   * пустую строку, и на бумаге получится «за  место».
   */
  columns: string[];
  rows: PresetRow[];
}

type Role = 'title' | 'label' | 'name' | 'main' | 'note';

interface PresetRow {
  role: Role;
  text: string;
  bold?: boolean;
}

/**
 * Родовые формы пишем через черту — «прошёл|прошла».
 *
 * Это тот синтаксис, который понимает `resolvePairedForms`: он раскрывает
 * пару по полу получателя, а когда пол по имени не читается, печатает
 * «прошёл/прошла» — законная запись на бумаге, из-за которой выпуск
 * останавливать не за что.
 *
 * Падеж имени выбирает фраза, в которую оно встроено. «Награждается»
 * и «Объявляется» требуют дательного — «Награждается Иванову», — поэтому
 * там стоит `%name_dat`, который считается сам из колонки «ФИО»
 * (см. `variables.ts`). А в сертификате имя стоит в придаточном —
 * «подтверждает, что Иванов прошёл», — и там верен именительный.
 */
const PRESETS: StarterPreset[] = [
  {
    id: 'sport-award',
    title: 'Грамота за место',
    hint: 'Победителям и призёрам соревнования',
    category: 'sport',
    documentTitle: 'Грамота за место',
    columns: ['name', 'email', 'place'],
    rows: [
      { role: 'title', text: 'Грамота' },
      { role: 'label', text: 'Награждается' },
      { role: 'name', text: '%name_dat' },
      { role: 'main', text: 'за %place_word место' },
      { role: 'main', text: '%event', bold: true },
      { role: 'note', text: '%event_place · %event_date' },
    ],
  },
  {
    id: 'contest-participant',
    title: 'Диплом участника',
    hint: 'Всем, кто вышел на старт',
    category: 'contest',
    documentTitle: 'Диплом участника',
    columns: ['name', 'email'],
    rows: [
      { role: 'title', text: 'Диплом' },
      { role: 'label', text: 'Награждается' },
      { role: 'name', text: '%name_dat' },
      { role: 'main', text: 'за участие в' },
      { role: 'main', text: '%event', bold: true },
      { role: 'note', text: '%event_place · %event_date' },
    ],
  },
  {
    id: 'course-certificate',
    title: 'Сертификат о прохождении',
    hint: 'Курсы и семинары, с объёмом часов',
    category: 'education',
    documentTitle: 'Сертификат о прохождении',
    columns: ['name', 'email'],
    rows: [
      { role: 'title', text: 'Сертификат' },
      { role: 'label', text: 'Настоящий сертификат подтверждает, что' },
      { role: 'name', text: '%name' },
      { role: 'main', text: 'прошёл|прошла обучение по программе' },
      { role: 'main', text: '%event', bold: true },
      { role: 'note', text: 'в объёме %hours' },
    ],
  },
  {
    id: 'corporate-thanks',
    title: 'Благодарность',
    hint: 'Сотрудникам, судьям, волонтёрам',
    category: 'corporate',
    documentTitle: 'Благодарность',
    columns: ['name', 'email'],
    rows: [
      { role: 'title', text: 'Благодарность' },
      { role: 'label', text: 'Объявляется' },
      { role: 'name', text: '%name_dat' },
      // Названия организации здесь нет: оно уже стоит в подвале, и второй
      // раз на том же листе читается как ошибка вёрстки.
      { role: 'main', text: 'за добросовестный труд и вклад в общее дело' },
      { role: 'note', text: '%date' },
    ],
  },
];

export const STARTER_PRESETS: readonly StarterPreset[] = PRESETS;

/**
 * Образец получателя: колонки, которые заводит организация.
 *
 * Показываем заполненный лист, а не «%name»: и заготовку в витрине,
 * и свой макет в редакторе человек оценивает глазами, а строка
 * с процентами не даёт понять, как документ будет выглядеть.
 * Женское имя — не случайность: на нём видно, что родовые формы
 * раскрываются, а не печатаются через черту.
 */
export const SAMPLE_RECIPIENT: Record<string, string> = {
  name: 'Кузьмина-Караваева Анна',
  place: '1',
  place_word: 'первое',
  /*
   * Производные переменные лежат здесь готовыми, как и `place_word`.
   *
   * Витрина заготовок отдаёт этот образец прямо в `SheetRenderer`, минуя
   * `mergeVariables`, — сама она ничего не вычисляет. Без готового
   * значения на плашке стояло бы «Награждается» с пустотой вместо имени.
   * В настоящем документе падеж считается из колонки «ФИО».
   */
  name_dat: 'Кузьминой-Караваевой Анне',
};

/**
 * Полный образец листа: получатель плюс всё, что подставляет сервис.
 *
 * Отдельно от `SAMPLE_RECIPIENT`, потому что в редакторе мероприятие,
 * организация и дата уже настоящие — там нужен образец только тех
 * колонок, которых ещё нет, а придуманное название мероприятия поверх
 * пустого поля «О мероприятии» сбивало бы с толку.
 */
export const PRESET_SAMPLE: Record<string, string> = {
  ...SAMPLE_RECIPIENT,
  event: 'Первенство области по плаванию',
  event_place: 'Челябинск',
  event_date: '17–19 июня 2026',
  hours: '72 часов',
  org: 'Федерация плавания',
  date: '02.08.2026',
};

export function findStarterPreset(id: string): StarterPreset | null {
  return PRESETS.find((p) => p.id === id) ?? null;
}

/** Свободное поле листа в долях страницы: рамка бланка сюда не попадает. */
const AREA = { top: 0.14, right: 0.12, bottom: 0.12, left: 0.12 };

/**
 * Кегли ролей друг относительно друга, где имя — единица.
 *
 * Абсолютных размеров здесь нет намеренно: стопка должна заполнять
 * свободное поле, а не быть фиксированной долей листа. Иначе на A5 текст
 * оказывается крупным, а на A3 плавает в пустоте.
 */
const SIZE_OF_NAME: Record<Role, number> = {
  title: 0.78,
  label: 0.3,
  name: 1,
  main: 0.42,
  note: 0.3,
};

/** Высота блока в долях его кегля. У имени — две строки про запас. */
const HEIGHT_OF_SIZE: Record<Role, number> = {
  title: 1.5,
  label: 1.8,
  name: 2.4,
  main: 1.5,
  note: 1.6,
};

/** Отступ снизу от строки этой роли, в долях её кегля. */
const GAP_AFTER: Record<Role, number> = {
  title: 1.1,
  label: 0.5,
  name: 0.5,
  main: 0.3,
  note: 0,
};

/** Какую часть высоты свободного поля занимает стопка целиком. */
const FIELD_FILL = 0.82;
/** Крупнее этого имя выглядит криком даже на большом бланке. */
const NAME_MAX_OF_WIDTH = 0.12;
/** Мельче — нечитаемо на печати. */
const NAME_MIN_MM = 5;

/**
 * Оптическая поправка: стопка, стоящая ровно по геометрическому центру,
 * глазу кажется съехавшей вниз. Поднимаем на долю высоты листа.
 */
const OPTICAL_LIFT = 0.02;

const MM_TO_PT = 72 / 25.4;

const INK = '#4a3628';
const ACCENT = '#8b2020';
const NAME_INK = '#7a1e1e';

export interface StarterPresetContext {
  pageWidthMm: number;
  pageHeightMm: number;
}

/**
 * Раскладывает заготовку по листу заданного размера.
 *
 * Возвращает готовый макет — тот же контракт, что пишет редактор
 * и читает серверный рендер, версии `CURRENT_LAYOUT_SCHEMA_VERSION`.
 */
export function buildStarterLayout(
  preset: StarterPreset,
  ctx: StarterPresetContext,
): SheetLayout {
  const { rows } = preset;
  const fieldWidth = ctx.pageWidthMm * (1 - AREA.left - AREA.right);
  const regionTop = ctx.pageHeightMm * AREA.top;
  const regionHeight = ctx.pageHeightMm * (1 - AREA.top - AREA.bottom);

  /*
   * Сначала считаем стопку в долях кегля имени, потом подбираем сам кегль
   * так, чтобы она заняла нужную часть свободного поля. Меняется формат
   * листа — меняется весь набор размеров разом, а пропорции между строками
   * остаются те же.
   */
  const unitsOf = (fn: (row: PresetRow, last: boolean) => number) =>
    rows.reduce((sum, row, i) => sum + fn(row, i === rows.length - 1), 0);

  // Полосу под подпись закладываем до расчёта: иначе стопка занимает всё
  // поле, подписи не остаётся места, а документ без подписи не документ.
  const footerUnits = SIZE_OF_NAME.note * HEIGHT_OF_SIZE.note * 2.2;
  const units =
    unitsOf((row, last) => {
      const size = SIZE_OF_NAME[row.role];
      return size * HEIGHT_OF_SIZE[row.role] + (last ? 0 : size * GAP_AFTER[row.role]);
    }) + footerUnits;

  const nameMm = Math.min(
    Math.max((regionHeight * FIELD_FILL) / units, NAME_MIN_MM),
    ctx.pageWidthMm * NAME_MAX_OF_WIDTH,
  );
  const sizeMm = (role: Role) => nameMm * SIZE_OF_NAME[role];

  const heights = rows.map((row) => sizeMm(row.role) * HEIGHT_OF_SIZE[row.role]);
  const gaps = rows.map((row, i) =>
    i === rows.length - 1 ? 0 : sizeMm(row.role) * GAP_AFTER[row.role],
  );
  const stackHeight = sum(heights) + sum(gaps);
  const footerBand = nameMm * footerUnits;

  // Стопку центруем в поле за вычетом полосы подписи — иначе она наедет на неё.
  const startY = Math.max(
    regionTop,
    regionTop + (regionHeight - footerBand - stackHeight) / 2 - ctx.pageHeightMm * OPTICAL_LIFT,
  );

  const layout: SheetLayout = [];
  let y = startY;

  rows.forEach((row, index) => {
    layout.push(
      textElement({
        id: `${preset.id}-${index}`,
        z: index,
        x: ctx.pageWidthMm * AREA.left,
        y,
        w: fieldWidth,
        h: heights[index],
        sizeMm: sizeMm(row.role),
        role: row.role,
        text: row.text,
        bold: row.bold ?? false,
        align: 'center',
      }),
    );
    y += heights[index] + gaps[index];
  });

  /*
   * Подвал прижат к низу поля, а не стоит в стопке: слева должность
   * подписанта, справа фамилия — так подписывают приказом, и подпись
   * человек ищет именно там. В стопке они уезжали бы вверх вслед
   * за длинным именем.
   *
   * Должность и фамилия — обычный текст, а не переменные: служебных
   * переменных подписанта в текущем контракте нет, и подставить их
   * было бы нечем. Человек вписывает их один раз в редакторе.
   */
  const footerSize = sizeMm('note');
  const footerHeight = footerSize * HEIGHT_OF_SIZE.note;
  const bottom = ctx.pageHeightMm * (1 - AREA.bottom);
  const signY = bottom - footerHeight * 2.2;
  const half = fieldWidth / 2 - footerSize;

  if (signY > y && half > 0) {
    layout.push(
      textElement({
        id: `${preset.id}-signer-role`,
        z: rows.length,
        x: ctx.pageWidthMm * AREA.left,
        y: signY,
        w: half,
        h: footerHeight,
        sizeMm: footerSize,
        role: 'note',
        text: 'Должность подписанта',
        bold: false,
        align: 'left',
      }),
      textElement({
        id: `${preset.id}-signer-name`,
        z: rows.length + 1,
        x: ctx.pageWidthMm * (1 - AREA.right) - half,
        y: signY,
        w: half,
        h: footerHeight,
        sizeMm: footerSize,
        role: 'note',
        text: 'И. О. Фамилия',
        bold: false,
        align: 'right',
      }),
      textElement({
        id: `${preset.id}-issued`,
        z: rows.length + 2,
        x: ctx.pageWidthMm * AREA.left,
        y: bottom - footerHeight,
        w: fieldWidth,
        h: footerHeight,
        sizeMm: footerSize,
        role: 'note',
        text: '%org',
        bold: false,
        align: 'center',
      }),
    );
  }

  return layout;
}

/** Лист заготовки целиком — то, что уходит в базу при создании материала. */
export function buildStarterSheet(preset: StarterPreset, ctx: StarterPresetContext) {
  return {
    position: 0,
    layout: buildStarterLayout(preset, ctx),
    schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
  };
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function textElement(o: {
  id: string;
  z: number;
  x: number;
  y: number;
  w: number;
  h: number;
  sizeMm: number;
  role: Role;
  text: string;
  bold: boolean;
  align: 'left' | 'center' | 'right';
}): SheetLayout[number] {
  const isName = o.role === 'name';
  const isTitle = o.role === 'title';
  const isLabel = o.role === 'label';

  return {
    id: o.id,
    type: 'text',
    x: round(o.x),
    y: round(o.y),
    w: round(o.w),
    h: round(o.h),
    rotation: 0,
    z: o.z,
    props: {
      text: o.text,
      fontFamily: isName || isTitle ? 'Playfair Display' : 'PT Serif',
      fontSize: Number((o.sizeMm * MM_TO_PT).toFixed(1)),
      color: isName ? NAME_INK : isTitle || isLabel ? ACCENT : INK,
      align: o.align,
      lineHeight: isName ? 1.15 : 1.3,
      letterSpacing: isTitle || isLabel ? Number((o.sizeMm * 0.1 * MM_TO_PT).toFixed(2)) : 0,
      bold: o.bold || isTitle,
      italic: false,
      underline: false,
      uppercase: isLabel,
      strokeWidth: 0,
      strokeColor: '#ffffff',
      autoFit: true,
    },
  };
}

/** Миллиметры до сотых: дальше точность бессмысленна, а в json попадает мусор. */
function round(mm: number): number {
  return Number(mm.toFixed(2));
}
