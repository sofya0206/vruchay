import type { CSSProperties, ReactNode } from 'react';
import {
  SYSTEM_VARIABLE_NAMES,
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

/** Оформление прогона из его марок — CSS поверх стиля блока. */
export function markStyle(marks: RichMark[] | undefined): CSSProperties {
  if (!marks || marks.length === 0) return {};
  const css: CSSProperties = {};
  const decoration: string[] = [];

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
      case 'textStyle': {
        const a = mark.attrs;
        if (a.color) css.color = a.color;
        if (a.background) css.backgroundColor = a.background;
        if (a.fontFamily) css.fontFamily = a.fontFamily;
        if (a.fontSize) css.fontSize = `${a.fontSize}pt`;
        if (a.fontWeight != null) css.fontWeight = a.fontWeight;
        if (a.letterSpacing != null) css.letterSpacing = `${a.letterSpacing}pt`;
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
  if (marks?.some((m) => m.type === 'superscript')) return <sup>{node}</sup>;
  if (marks?.some((m) => m.type === 'subscript')) return <sub>{node}</sub>;
  return node;
}

export interface RichTextProps {
  blocks: ResolvedBlock[];
  base: TextProps;
  fields: FieldRender;
  /**
   * Названия колонок по ключу — для подписи фишки на холсте.
   * На печати не нужно: там поле уже текст.
   */
  labels?: Record<string, string>;
  /** Клик по фишке на холсте: открыть настройки поля. */
  onFieldClick?: (field: ResolvedField) => void;
}

export function RichText({ blocks, base, fields, labels, onFieldClick }: RichTextProps) {
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
              <Inline key={j} node={node} fields={fields} labels={labels} onFieldClick={onFieldClick} />
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
}: {
  node: ResolvedInline;
  fields: FieldRender;
  labels?: Record<string, string>;
  onFieldClick?: (field: ResolvedField) => void;
}) {
  if (node.type === 'break') return <br />;

  if (node.type === 'text') {
    // Текст — содержимым узла: React экранирует его сам, разметка
    // из данных получателей отрисована не будет.
    return wrapIndex(node.marks, <span style={markStyle(node.marks)}>{node.text}</span>);
  }

  if (fields === 'value') {
    if (node.text === '') return null;
    return wrapIndex(node.marks, <span style={markStyle(node.marks)}>{node.text}</span>);
  }

  if (fields === 'highlight') {
    if (node.text === '') return null;
    return wrapIndex(
      node.marks,
      <span className="merge-value" data-field={node.attrs.source} style={markStyle(node.marks)}>
        {node.text}
      </span>,
    );
  }

  return <FieldChip field={node} labels={labels} onClick={onFieldClick} />;
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
}: {
  field: ResolvedField;
  labels?: Record<string, string>;
  onClick?: (field: ResolvedField) => void;
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
      style={markStyle(field.marks)}
      onPointerDown={onClick ? (e) => e.stopPropagation() : undefined}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(field); } : undefined}
    >
      {shown}
    </span>,
  );
}
