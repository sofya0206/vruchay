import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  applyFitStepToStyle,
  keepVariable,
  NO_FIT,
  resolveHrefTemplate,
  resolveRichDoc,
  substituteVariables,
  type FitStep,
  type ResolvedField,
  type ShapeElement,
  type SheetElement,
  type SheetLayout,
  type TextElement,
} from '@gramota/shared';
import { RichText, type FieldRender } from './RichText';
import { useAutoFit } from './useAutoFit';

/**
 * Единый рендер листа: используется редактором, превью и страницей, которую
 * печатает в PDF headless-браузер. Именно поэтому здесь нет ничего «экранного» —
 * размеры в миллиметрах, никаких зависимостей от размера окна. Масштабирование
 * для экрана делает родитель через CSS-трансформацию, на печати трансформации нет,
 * и результат совпадает с тем, что видел пользователь.
 */

export interface SheetRendererProps {
  layout: SheetLayout;
  pageWidthMm: number;
  pageHeightMm: number;
  backgroundUrl?: string | null;
  /** Значения полей: колонки таблицы получателей и служебные переменные. */
  data?: Record<string, string>;
  /**
   * Что делать с полем, для которого значения нет.
   *
   * `blank` — убрать: на печати незаполненное поле обязано исчезнуть,
   * иначе «%event» уедет на бумагу. `token` — оставить видимым:
   * в редакторе и в миниатюрах списка пустое место читается как поломка
   * макета, а фишка показывает, чего не хватает.
   */
  unfilled?: 'blank' | 'token';
  /**
   * Как рисовать поля: `value` — текстом, как на печати; `chip` — фишками,
   * как на холсте. Умолчание следует за `unfilled`: печать — текстом,
   * холст — фишками.
   */
  fields?: FieldRender;
  /** Какие ключи существуют — чтобы отличить пустую колонку от пропавшей. */
  knownFields?: ReadonlySet<string> | null;
  /** Названия колонок по ключу — подписи фишек. */
  fieldLabels?: Record<string, string>;
  /**
   * Адрес проверки подлинности этого экземпляра: /verify/<publicId>.
   * Есть только при печати — в редакторе экземпляра ещё не существует,
   * и QR там показывается образцом.
   */
  verifyUrl?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelect?: (id: string | null, additive: boolean) => void;
  /** Двойной клик по блоку — редактировать содержимое на месте. */
  onEdit?: (id: string) => void;
  onFieldClick?: (elementId: string, field: ResolvedField) => void;
  /** Блок, который сейчас правится живым редактором: его статичный вид не рисуем. */
  editingId?: string | null;
  /** Что нарисовать вместо статичного вида правящегося блока. */
  renderEditing?: (element: TextElement) => React.ReactNode;
}

export function SheetRenderer({
  layout,
  pageWidthMm,
  pageHeightMm,
  backgroundUrl,
  data,
  unfilled = 'blank',
  fields = unfilled === 'blank' ? 'value' : 'chip',
  knownFields,
  fieldLabels,
  verifyUrl,
  selectedIds,
  onSelect,
  onEdit,
  onFieldClick,
  editingId,
  renderEditing,
}: SheetRendererProps) {
  return (
    <div
      className="relative overflow-hidden bg-white"
      style={{ width: `${pageWidthMm}mm`, height: `${pageHeightMm}mm` }}
      onPointerDown={onSelect ? () => onSelect(null, false) : undefined}
    >
      {backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
        />
      )}
      {[...layout]
        .filter((el) => !el.hidden)
        .sort((a, b) => a.z - b.z)
        .map((el) => (
          <ElementView
            key={el.id}
            element={el}
            data={data}
            unfilled={unfilled}
            fields={fields}
            knownFields={knownFields}
            fieldLabels={fieldLabels}
            verifyUrl={verifyUrl}
            interactive={Boolean(onSelect)}
            selected={selectedIds?.has(el.id) ?? false}
            onSelect={onSelect}
            onEdit={onEdit}
            onFieldClick={onFieldClick}
            editing={editingId === el.id}
            renderEditing={renderEditing}
          />
        ))}
    </div>
  );
}

interface ElementViewProps {
  element: SheetElement;
  data?: Record<string, string>;
  unfilled: 'blank' | 'token';
  fields: FieldRender;
  knownFields?: ReadonlySet<string> | null;
  fieldLabels?: Record<string, string>;
  verifyUrl?: string | null;
  interactive: boolean;
  selected: boolean;
  onSelect?: (id: string, additive: boolean) => void;
  onEdit?: (id: string) => void;
  onFieldClick?: (elementId: string, field: ResolvedField) => void;
  editing: boolean;
  renderEditing?: (element: TextElement) => React.ReactNode;
}

/**
 * QR как картинка.
 *
 * Именно <img> с data-URL, а не canvas: страницу печати открывает
 * headless-браузер и ждёт загрузки всех изображений, прежде чем печатать.
 * Картинка попадает в это ожидание сама, а нарисованный на canvas код
 * мог бы не успеть — и в PDF оказался бы пустой квадрат.
 */
function QrImage({ value, color }: { value: string; color: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(value, {
      margin: 0,
      // Уровень коррекции M: терпит загрязнение и типографский брак,
      // но не раздувает узор так, как высокие уровни.
      errorCorrectionLevel: 'M',
      color: { dark: color, light: '#00000000' },
      // Крупная сторона: код печатают, и растр не должен мылить при
      // масштабировании в миллиметры.
      width: 512,
    }).then((url) => alive && setSrc(url));
    return () => {
      alive = false;
    };
  }, [value, color]);

  if (!src) return null;
  return <img src={src} alt="" draggable={false} className="h-full w-full select-none" />;
}

/** Адрес сервиса: на печати страница открыта по внутреннему адресу. */
function origin(): string {
  return typeof window === 'undefined' ? 'https://vruchay.ru' : window.location.origin;
}

/**
 * Стили текстового блока целиком — те, поверх которых ложатся марки.
 *
 * Вынесены отдельно, потому что нужны дважды: статичному виду и живому
 * редактору поверх него. Оба обязаны получить один и тот же CSS — иначе
 * текст «прыгал» бы при входе в правку.
 */
export function textBlockStyle(props: TextElement['props'], fit: FitStep = NO_FIT): React.CSSProperties {
  const inset = props.padding + props.borderWidth;
  // Кегль, межстрочный и разрядка на ступени лестницы — той же функцией,
  // что и у измерителя: ужатый блок на печати совпадает с тем, что он посчитал.
  const fitted = applyFitStepToStyle(
    {
      fontFamily: props.fontFamily,
      fontSize: props.fontSize,
      bold: props.bold,
      italic: props.italic,
      lineHeight: props.lineHeight,
      letterSpacing: props.letterSpacing,
      uppercase: props.uppercase,
      strokeWidth: props.strokeWidth,
    },
    fit,
  );
  return {
    display: 'flex',
    alignItems:
      props.verticalAlign === 'top'
        ? 'flex-start'
        : props.verticalAlign === 'bottom'
          ? 'flex-end'
          : 'center',
    boxSizing: 'border-box',
    padding: inset ? `${props.padding}mm` : undefined,
    backgroundColor: props.background ?? undefined,
    border: props.borderWidth ? `${props.borderWidth}mm solid ${props.borderColor}` : undefined,
    fontFamily: props.fontFamily,
    fontSize: `${roundPt(fitted.fontSize)}pt`,
    color: props.color,
    fontWeight: props.bold ? 700 : 400,
    fontStyle: props.italic ? 'italic' : 'normal',
    textDecoration: props.underline ? 'underline' : 'none',
    textTransform: props.uppercase ? 'uppercase' : 'none',
    lineHeight: roundPt(fitted.lineHeight),
    letterSpacing: `${roundPt(fitted.letterSpacing)}pt`,
    textAlign: props.align,
    textShadow: props.shadow ? '0 0.3mm 0.6mm rgba(0,0,0,0.35)' : undefined,
    // Обводка кладётся под буквы (paint-order), иначе она съедала бы
    // изнутри тонкие засечки и рукописные росчерки.
    ...(props.strokeWidth > 0
      ? {
          WebkitTextStrokeWidth: `${props.strokeWidth}mm`,
          WebkitTextStrokeColor: props.strokeColor,
          paintOrder: 'stroke fill',
        }
      : {}),
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflow: 'hidden',
  };
}

/** Пункты до сотых — как в марках. */
function roundPt(value: number): number {
  return Math.round(value * 100) / 100;
}

function ElementView(props: ElementViewProps) {
  if (props.element.type === 'text') return <TextElementView {...props} element={props.element} />;
  return <PlainElementView {...props} />;
}

/**
 * Текстовый блок — отдельным компонентом ради подгонки: у него есть
 * состояние (ступень лестницы), которого у остальных блоков нет.
 */
function TextElementView({
  element,
  data,
  unfilled,
  fields,
  knownFields,
  fieldLabels,
  interactive,
  selected,
  onSelect,
  onEdit,
  onFieldClick,
  editing,
  renderEditing,
}: ElementViewProps & { element: TextElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const fit = useAutoFit(ref, element.props.autoFit && !editing, element.props.lineHeight, [
    element.props,
    element.w,
    element.h,
    data,
    unfilled,
    fields,
  ]);

  return (
    <div
      ref={ref}
      data-element-id={element.id}
      data-fit-step={fit.fontScale < 1 || fit.lineScale < 1 || fit.trackingEm !== 0 ? fit.fontScale : undefined}
      onPointerDown={
        interactive
          ? (e: React.PointerEvent) => {
              e.stopPropagation();
              onSelect?.(element.id, e.shiftKey);
            }
          : undefined
      }
      onDoubleClick={
        interactive && onEdit
          ? (e: React.MouseEvent) => {
              e.stopPropagation();
              onEdit(element.id);
            }
          : undefined
      }
      className={selected ? 'outline-2 outline-indigo-500 outline-dashed' : undefined}
      style={{ ...boxStyle(element), ...textBlockStyle(element.props, fit) }}
    >
      {editing && renderEditing ? (
        renderEditing(element)
      ) : (
        <TextBody
          element={element}
          data={data}
          unfilled={unfilled}
          fields={fields}
          knownFields={knownFields}
          fieldLabels={fieldLabels}
          onFieldClick={onFieldClick}
          fit={fit}
        />
      )}
    </div>
  );
}

function boxStyle(element: SheetElement): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${element.x}mm`,
    top: `${element.y}mm`,
    width: `${element.w}mm`,
    height: `${element.h}mm`,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    zIndex: element.z,
    opacity: element.opacity < 1 ? element.opacity : undefined,
  };
}

function PlainElementView({
  element,
  data,
  unfilled,
  verifyUrl,
  interactive,
  selected,
  onSelect,
  onEdit,
}: ElementViewProps) {
  const onMissing = unfilled === 'token' ? keepVariable : undefined;
  const box = boxStyle(element);

  const common = {
    'data-element-id': element.id,
    onPointerDown: interactive
      ? (e: React.PointerEvent) => {
          e.stopPropagation();
          onSelect?.(element.id, e.shiftKey);
        }
      : undefined,
    onDoubleClick:
      interactive && onEdit
        ? (e: React.MouseEvent) => {
            e.stopPropagation();
            onEdit(element.id);
          }
        : undefined,
    className: selected ? 'outline-2 outline-indigo-500 outline-dashed' : undefined,
  };

  if (element.type === 'text') return null;

  if (element.type === 'image') {
    return (
      <div {...common} style={box}>
        <img
          src={`/api/documents/files/${element.props.fileId}/raw`}
          alt=""
          draggable={false}
          className="h-full w-full object-contain select-none"
        />
      </div>
    );
  }

  if (element.type === 'qr') {
    /*
     * Что кодируем:
     *  — свой шаблон, если организация его задала (с подстановкой переменных);
     *  — иначе адрес проверки подлинности этого экземпляра.
     *
     * В редакторе экземпляра ещё нет, поэтому кодируем образец: человек
     * должен видеть настоящий узор, чтобы оценить размер и читаемость.
     * Пустой квадрат на его месте выглядел бы поломкой.
     */
    const template = element.props.template.trim();
    const value = template
      ? // QR кодирует адрес, а не фразу: парные формы здесь неуместны.
        substituteVariables(template, data ?? {}, onMissing)
      : (verifyUrl ?? `${origin()}/verify/00000000-0000-0000-0000-000000000000`);

    /*
     * QR кликается: на экране — одним кликом, на бумаге — камерой. Это
     * тот же `<a>`, что и у ссылки: при печати Chromium делает из него
     * аннотацию, и в PDF квадрат кода становится горячей областью.
     */
    const href = /^https?:\/\//i.test(value) ? value : null;
    return (
      <div {...common} style={box}>
        {href ? (
          <a href={href} rel="noreferrer noopener" target="_blank" style={{ display: 'block', width: '100%', height: '100%' }}>
            <QrImage value={value} color={element.props.color} />
          </a>
        ) : (
          <QrImage value={value} color={element.props.color} />
        )}
      </div>
    );
  }

  if (element.type === 'shape') {
    return (
      <div {...common} style={box}>
        <Shape element={element} />
      </div>
    );
  }

  /*
   * Ссылка-область. Адрес — шаблон с полями; на печати они подставлены,
   * на холсте остаются как есть. Если после подстановки адреса не вышло
   * (поле пустое), область печатается без ссылки — битая аннотация хуже.
   */
  const href = unfilled === 'token' ? element.props.url : resolveHrefTemplate(element.props.url, data ?? {});
  if (!href) return <div {...common} style={box} />;
  return (
    <a {...common} style={box} href={href} rel="noreferrer noopener" target="_blank">
      <span className="sr-only">{element.props.url}</span>
    </a>
  );
}

/**
 * Фигура — SVG в миллиметрах.
 *
 * `viewBox` совпадает с размером блока в мм, поэтому обводка задаётся
 * в тех же миллиметрах и печатается той же толщиной, что видна на холсте.
 * Линия идёт по диагонали блока сверху-слева вниз-вправо: горизонтальная
 * линия — это блок высотой в толщину, повёрнутая — блок с поворотом.
 */
function Shape({ element }: { element: ShapeElement }) {
  const { w, h } = element;
  const p = element.props;
  const half = p.strokeWidth / 2;
  const common = {
    fill: p.fill ?? 'none',
    stroke: p.strokeWidth > 0 ? p.stroke : 'none',
    strokeWidth: p.strokeWidth,
    strokeDasharray: p.dash > 0 ? `${p.dash} ${p.dash}` : undefined,
    vectorEffect: 'non-scaling-stroke' as const,
  };

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {p.kind === 'rect' && (
        <rect x={half} y={half} width={Math.max(w - p.strokeWidth, 0)} height={Math.max(h - p.strokeWidth, 0)} rx={p.radius} {...common} />
      )}
      {p.kind === 'ellipse' && (
        <ellipse cx={w / 2} cy={h / 2} rx={Math.max(w / 2 - half, 0)} ry={Math.max(h / 2 - half, 0)} {...common} />
      )}
      {p.kind === 'line' && <line x1={0} y1={h / 2} x2={w} y2={h / 2} {...common} fill="none" />}
    </svg>
  );
}

/** Подставленный текст блока — статичный вид, общий для холста и печати. */
function TextBody({
  element,
  data,
  unfilled,
  fields,
  knownFields,
  fieldLabels,
  onFieldClick,
  fit,
}: {
  element: TextElement;
  data?: Record<string, string>;
  unfilled: 'blank' | 'token';
  fields: FieldRender;
  knownFields?: ReadonlySet<string> | null;
  fieldLabels?: Record<string, string>;
  onFieldClick?: (elementId: string, field: ResolvedField) => void;
  fit: FitStep;
}) {
  const blocks = useMemo(
    () =>
      resolveRichDoc(element.props.doc, {
        data: data ?? {},
        known: knownFields,
        unfilled,
      }),
    [element.props.doc, data, knownFields, unfilled],
  );

  return (
    <RichText
      blocks={blocks}
      base={element.props}
      fields={fields}
      fit={fit}
      labels={fieldLabels}
      onFieldClick={onFieldClick ? (field) => onFieldClick(element.id, field) : undefined}
    />
  );
}
