import { substituteVariables, type SheetElement, type SheetLayout } from '@gramota/shared';

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
  /** В редакторе показываем сами переменные, а не подстановку. */
  showRawVariables?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

export function SheetRenderer({
  layout,
  pageWidthMm,
  pageHeightMm,
  backgroundUrl,
  data,
  showRawVariables = false,
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
            showRawVariables={showRawVariables}
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
  showRawVariables: boolean;
  interactive: boolean;
  selected: boolean;
  onSelect?: (id: string) => void;
}

function ElementView({
  element,
  data,
  showRawVariables,
  interactive,
  selected,
  onSelect,
}: ElementViewProps) {
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
    const text = showRawVariables ? props.text : substituteVariables(props.text, data ?? {});
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
          lineHeight: props.lineHeight,
          letterSpacing: `${props.letterSpacing}pt`,
          textAlign: props.align,
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
    // Пока заглушка: настоящий QR появится вместе со страницей проверки подлинности.
    return (
      <div
        {...common}
        style={{ ...box, border: '1px dashed #94a3b8', display: 'grid', placeItems: 'center' }}
      >
        <span style={{ fontSize: '3mm', color: '#64748b' }}>QR</span>
      </div>
    );
  }

  return (
    <a {...common} style={box} href={element.props.url} rel="noreferrer noopener" target="_blank">
      <span className="sr-only">{element.props.url}</span>
    </a>
  );
}
