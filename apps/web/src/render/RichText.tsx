import type { CSSProperties, ReactNode } from 'react';
import {
  NO_FIT,
  SYSTEM_VARIABLE_NAMES,
  type FitStep,
  type ResolvedBlock,
  type ResolvedField,
  type ResolvedInline,
  type RichMark,
  type TextProps,
} from '@gramota/shared';

/**
 * Отрисовка текста блока — одна на холст и на печать.
 *
 * На входе не дерево, а уже подставленные строки из `resolveRichDoc`:
 * это единственная дорога, по которой поля становятся значениями, и она
 * общая с измерителем. Здесь решается только, как это выглядит.
 *
 * Два режима различаются одним: как показать поле. На печати поле —
 * обычный текст, неотличимый от соседних букв; на холсте — фишка,
 * по которой видно, что это подстановка, что она подставила и не пропала
 * ли колонка. Всё остальное — марки, абзацы, списки — рисуется одинаково,
 * и это не совпадение, а то, что защищают тесты блока 10: PDF печатает
 * ту же разметку, что видел человек.
 *
 * Живой редактор (TipTap) здесь не поднимается никогда: он появляется
 * на холсте только поверх одного блока и только пока его правят.
 */

/**
 * `value` — текстом, как на печати; `chip` — фишкой, как на холсте
 * в режиме заготовки; `highlight` — текстом с лёгкой подсветкой: режим
 * «данные строки», где видно и что напечатается, и откуда оно взялось.
 */
export type FieldRender = 'value' | 'chip' | 'highlight';

/** Ступень отступа списка в миллиметрах — примерно ширина двух букв. */
export const INDENT_MM = 6;

/**
 * Ступень автомасштаба, применённая к прогону: кегль марки ужимается
 * в той же доле, что и кегль блока, а разрядка марки получает ту же
 * добавку в долях em — ровно так считает и измеритель (`applyFitStepToStyle`).
 */
export interface MarkFit {
  step: FitStep;
  /** Кегль блока в пунктах — от него считается em для прогона без своего кегля. */
  baseFontSize: number;
}

/** Оформление прогона из его марок — CSS поверх стиля блока. */
export function markStyle(marks: RichMark[] | undefined, fit?: MarkFit): CSSProperties {
  if (!marks || marks.length === 0) return {};
  const css: CSSProperties = {};
  const decoration: string[] = [];
  const scale = fit?.step.fontScale ?? 1;

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        css.fontWeight = 700;
        break;
      case 'italic':
        css.fontStyle = 'italic';
        break;
      case 'underline':
        decoration.push('underline');
        break;
      case 'strike':
        decoration.push('line-through');
        break;
      case 'link':
        // Подчёркивание ссылки — её собственное решение, поверх подчёркивания текста.
        if (mark.attrs.underline) decoration.push('underline');
        if (mark.attrs.color) css.color = mark.attrs.color;
        break;
      case 'textStyle': {
        const a = mark.attrs;
        if (a.color) css.color = a.color;
        if (a.background) css.backgroundColor = a.background;
        if (a.fontFamily) css.fontFamily = a.fontFamily;
        if (a.fontSize) css.fontSize = `${round(a.fontSize * scale)}pt`;
        if (a.fontWeight != null) css.fontWeight = a.fontWeight;
        if (a.letterSpacing != null) {
          const runFontSize = (a.fontSize ?? fit?.baseFontSize ?? 0) * scale;
          const tracking = fit ? fit.step.trackingEm * runFontSize : 0;
          css.letterSpacing = `${round(a.letterSpacing + tracking)}pt`;
        }
        if (a.wordSpacing != null) css.wordSpacing = `${a.wordSpacing}pt`;
        if (a.transform === 'uppercase') css.textTransform = 'uppercase';
        if (a.transform === 'lowercase') css.textTransform = 'lowercase';
        if (a.transform === 'smallcaps') css.fontVariant = 'small-caps';
        break;
      }
      default:
        break;
    }
  }

  if (decoration.length) css.textDecoration = decoration.join(' ');
  return css;
}

/** Пункты до сотых: дальше браузер не различает, а в разметке мусор. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Каким начертанием на самом деле набран прогон — семейство, вес, наклон.
 *
 * Нужно странице печати: она спрашивает браузер про каждое начертание
 * отдельно, и без марок спрашивала бы только про начертание блока —
 * полужирная фамилия внутри обычной строки прошла бы мимо проверки
 * и напечаталась запасным шрифтом.
 */
export function runFace(
  base: Pick<TextProps, 'fontFamily' | 'bold' | 'italic'>,
  marks: RichMark[] | undefined,
): { family: string; weight: number; style: 'normal' | 'italic' } {
  let family = base.fontFamily;
  let weight = base.bold ? 700 : 400;
  let style: 'normal' | 'italic' = base.italic ? 'italic' : 'normal';
  for (const mark of marks ?? []) {
    if (mark.type === 'bold') weight = 700;
    if (mark.type === 'italic') style = 'italic';
    if (mark.type === 'textStyle') {
      if (mark.attrs.fontFamily) family = mark.attrs.fontFamily;
      if (mark.attrs.fontWeight != null) weight = mark.attrs.fontWeight;
    }
  }
  return { family, weight, style };
}

/** Индексы — тегами: браузер сам делает их мельче и сдвигает. */
function wrapIndex(marks: RichMark[] | undefined, node: ReactNode): ReactNode {
  const inner = wrapLink(marks, node);
  if (marks?.some((m) => m.type === 'superscript')) return <sup>{inner}</sup>;
  if (marks?.some((m) => m.type === 'subscript')) return <sub>{inner}</sub>;
  return inner;
}

/**
 * Ссылка — настоящим `<a>`: Chromium при печати превращает его в аннотацию,
 * и в PDF по ней можно кликнуть. На холсте адрес остаётся шаблоном
 * с полями — переход по нему не нужен и не работает, это только вид.
 */
function wrapLink(marks: RichMark[] | undefined, node: ReactNode): ReactNode {
  const link = marks?.find((m) => m.type === 'link');
  if (!link || link.type !== 'link') return node;
  return (
    <a href={link.attrs.href} rel="noreferrer noopener" target="_blank" style={{ color: 'inherit', textDecoration: 'inherit' }}>
      {node}
    </a>
  );
}

export interface RichTextProps {
  blocks: ResolvedBlock[];
  base: TextProps;
  fields: FieldRender;
  /** Ступень автомасштаба блока — для кеглей и разрядки марок. */
  fit?: FitStep;
  /**
   * Названия колонок по ключу — для подписи фишки на холсте.
   * На печати не нужно: там поле уже текст.
   */
  labels?: Record<string, string>;
  /** Клик по фишке на холсте: открыть настройки поля. */
  onFieldClick?: (field: ResolvedField) => void;
}

export function RichText({ blocks, base, fields, labels, onFieldClick, fit = NO_FIT }: RichTextProps) {
  const markFit: MarkFit = { step: fit, baseFontSize: base.fontSize };
  return (
    // Одна обёртка на всю стопку абзацев: flex-контейнер блока выравнивает
    // по вертикали её целиком, а не каждый абзац отдельно.
    <div style={{ width: '100%' }}>
      {blocks.map((block, i) => (
        <div
          key={i}
          style={{
            textAlign: block.align ?? base.align,
            paddingLeft: block.indent ? `${block.indent * INDENT_MM}mm` : undefined,
            // Маркер стоит на отступе, текст — правее него.
            textIndent: block.marker ? `-${INDENT_MM}mm` : undefined,
            marginLeft: block.marker ? `${INDENT_MM}mm` : undefined,
          }}
        >
          {block.marker && (
            <span style={{ display: 'inline-block', width: `${INDENT_MM}mm`, textIndent: 0 }}>
              {block.marker}
            </span>
          )}
          {block.content.length === 0 ? (
            // Пустой абзац держит высоту строки — иначе отбивка схлопнется.
            <br />
          ) : (
            block.content.map((node, j) => (
              <Inline key={j} node={node} fields={fields} labels={labels} onFieldClick={onFieldClick} fit={markFit} />
            ))
          )}
        </div>
      ))}
    </div>
  );
}

function Inline({
  node,
  fields,
  labels,
  onFieldClick,
  fit,
}: {
  node: ResolvedInline;
  fields: FieldRender;
  labels?: Record<string, string>;
  onFieldClick?: (field: ResolvedField) => void;
  fit: MarkFit;
}) {
  if (node.type === 'break') return <br />;

  if (node.type === 'text') {
    // Текст — содержимым узла: React экранирует его сам, разметка
    // из данных получателей отрисована не будет.
    return wrapIndex(node.marks, <span style={markStyle(node.marks, fit)}>{node.text}</span>);
  }

  if (fields === 'value') {
    if (node.text === '') return null;
    return wrapIndex(node.marks, <span style={markStyle(node.marks, fit)}>{node.text}</span>);
  }

  if (fields === 'highlight') {
    if (node.text === '') return null;
    return wrapIndex(
      node.marks,
      <span className="merge-value" data-field={node.attrs.source} style={markStyle(node.marks, fit)}>
        {node.text}
      </span>,
    );
  }

  return <FieldChip field={node} labels={labels} onClick={onFieldClick} fit={fit} />;
}

/**
 * Фишка поля на холсте.
 *
 * Четыре состояния, и каждое видно без чтения: обычное поле — на цветной
 * подложке; служебное — другим оттенком, чтобы не искать его в таблице;
 * пустое — пунктиром и запасным текстом курсивом; пропавшая колонка —
 * красным и зачёркнутым. Последнее важнее прочих: это единственный след
 * того, что колонку переименовали или удалили, а макет всё ещё ждёт её.
 */
function FieldChip({
  field,
  labels,
  onClick,
  fit,
}: {
  field: ResolvedField;
  labels?: Record<string, string>;
  onClick?: (field: ResolvedField) => void;
  fit?: MarkFit;
}) {
  const { source, fallback } = field.attrs;
  const system = SYSTEM_VARIABLE_NAMES.includes(source);
  const label = labels?.[source] ?? source;

  const tone =
    field.state === 'unknown'
      ? 'chip-unknown'
      : field.state === 'empty'
        ? 'chip-empty'
        : system
          ? 'chip-system'
          : 'chip-field';

  const shown = field.state === 'ok' ? field.text : fallback ? fallback : label;

  return wrapIndex(
    field.marks,
    <span
      data-field={source}
      data-state={field.state}
      contentEditable={false}
      title={
        field.state === 'unknown'
          ? `Колонка «${label}» не найдена — её переименовали или удалили`
          : field.state === 'empty'
            ? `Поле «${label}» пустое${fallback ? `, показан запасной текст` : ''}`
            : system
              ? `Подставит сервис: ${label}`
              : `Из таблицы: ${label}`
      }
      className={`merge-chip ${tone}`}
      style={markStyle(field.marks, fit)}
      onPointerDown={onClick ? (e) => e.stopPropagation() : undefined}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(field); } : undefined}
    >
      {shown}
    </span>,
  );
}
