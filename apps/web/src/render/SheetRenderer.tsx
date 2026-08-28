import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  keepVariable,
  substituteForRow,
  substituteVariables,
  type SheetElement,
  type SheetLayout,
} from '@gramota/shared';

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
  /** Значения переменных: %name и остальные колонки таблицы получателей. */
  data?: Record<string, string>;
  /**
   * Что делать с переменной, для которой значения нет.
   *
   * `blank` — убрать: на печати незаполненная переменная обязана исчезнуть,
   * иначе «%event» уедет на бумагу. `token` — оставить сам «%event»:
   * в редакторе и в миниатюрах списка пустое место читается как поломка
   * макета, а токен показывает, чего не хватает.
   */
  unfilled?: 'blank' | 'token';
  /**
   * Адрес проверки подлинности этого экземпляра: /verify/<publicId>.
   * Есть только при печати — в редакторе экземпляра ещё не существует,
   * и QR там показывается образцом.
   */
  verifyUrl?: string | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

export function SheetRenderer({
  layout,
  pageWidthMm,
  pageHeightMm,
  backgroundUrl,
  data,
  unfilled = 'blank',
  verifyUrl,
  selectedId,
  onSelect,
}: SheetRendererProps) {
  return (
    <div
      className="relative overflow-hidden bg-white"
      style={{ width: `${pageWidthMm}mm`, height: `${pageHeightMm}mm` }}
      onPointerDown={onSelect ? () => onSelect(null) : undefined}
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
        .sort((a, b) => a.z - b.z)
        .map((el) => (
          <ElementView
            key={el.id}
            element={el}
            data={data}
            unfilled={unfilled}
            verifyUrl={verifyUrl}
            interactive={Boolean(onSelect)}
            selected={selectedId === el.id}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

interface ElementViewProps {
  element: SheetElement;
  data?: Record<string, string>;
  unfilled: 'blank' | 'token';
  verifyUrl?: string | null;
  interactive: boolean;
  selected: boolean;
  onSelect?: (id: string) => void;
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

function ElementView({
  element,
  data,
  unfilled,
  verifyUrl,
  interactive,
  selected,
  onSelect,
}: ElementViewProps) {
  const onMissing = unfilled === 'token' ? keepVariable : undefined;
  const box: React.CSSProperties = {
    position: 'absolute',
    left: `${element.x}mm`,
    top: `${element.y}mm`,
    width: `${element.w}mm`,
    height: `${element.h}mm`,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    zIndex: element.z,
  };

  const common = {
    'data-element-id': element.id,
    onPointerDown: interactive
      ? (e: React.PointerEvent) => {
          e.stopPropagation();
          onSelect?.(element.id);
        }
      : undefined,
    className: selected ? 'outline-2 outline-indigo-500 outline-dashed' : undefined,
  };

  if (element.type === 'text') {
    const { props } = element;
    const text = substituteForRow(props.text, data ?? {}, onMissing);
    return (
      <div
        {...common}
        style={{
          ...box,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            props.align === 'left' ? 'flex-start' : props.align === 'right' ? 'flex-end' : 'center',
          fontFamily: props.fontFamily,
          fontSize: `${props.fontSize}pt`,
          color: props.color,
          fontWeight: props.bold ? 700 : 400,
          fontStyle: props.italic ? 'italic' : 'normal',
          textDecoration: props.underline ? 'underline' : 'none',
          textTransform: props.uppercase ? 'uppercase' : 'none',
          lineHeight: props.lineHeight,
          letterSpacing: `${props.letterSpacing}pt`,
          textAlign: props.align,
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
        }}
      >
        {/* Текст выводится как содержимое узла — React экранирует его сам,
            произвольная разметка из данных получателей отрисована не будет. */}
        {text}
      </div>
    );
  }

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

    return (
      <div {...common} style={box}>
        <QrImage value={value} color={element.props.color} />
      </div>
    );
  }

  return (
    <a {...common} style={box} href={element.props.url} rel="noreferrer noopener" target="_blank">
      <span className="sr-only">{element.props.url}</span>
    </a>
  );
}
