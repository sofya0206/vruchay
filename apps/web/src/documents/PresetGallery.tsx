import { useMemo } from 'react';
import {
  buildStarterLayout,
  DOCUMENT_CATEGORIES,
  PRESET_SAMPLE,
  STARTER_PRESETS,
  type DocumentCategory,
  type StarterPreset,
} from '@gramota/shared';
import { SheetRenderer } from '../render/SheetRenderer';
import { SheetThumbnail } from './SheetThumbnail';

/**
 * Заготовки на входе в библиотеку.
 *
 * Показываем сам лист, а не название заготовки: «Грамота за место» ничего
 * не говорит о том, как она будет выглядеть, а человек выбирает глазами.
 * Лист рисуется тем же компонентом, что редактор и печать, — значит
 * увиденное здесь и есть то, что он получит.
 */
export function PresetGallery({
  category,
  size,
  busyId,
  onPick,
}: {
  /** Раздел из фильтра библиотеки: null — показываем все заготовки. */
  category: DocumentCategory | null;
  size: { widthMm: number; heightMm: number };
  /** Заготовка, из которой прямо сейчас создаётся материал. */
  busyId: string | null;
  onPick: (preset: StarterPreset) => void;
}) {
  const presets = useMemo(
    () => STARTER_PRESETS.filter((p) => !category || p.category === category),
    [category],
  );

  if (presets.length === 0) {
    const title = DOCUMENT_CATEGORIES.find((c) => c.id === category)?.title;
    return (
      <p className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-8 text-center text-sm text-[var(--text-muted)]">
        Для раздела «{title}» готовых заготовок пока нет — создайте материал с чистого листа
        и загрузите свой бланк.
      </p>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {presets.map((preset) => (
        <PresetCard
          key={preset.id}
          preset={preset}
          size={size}
          busy={busyId === preset.id}
          disabled={busyId !== null}
          onPick={() => onPick(preset)}
        />
      ))}
    </ul>
  );
}

function PresetCard({
  preset,
  size,
  busy,
  disabled,
  onPick,
}: {
  preset: StarterPreset;
  size: { widthMm: number; heightMm: number };
  busy: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  // Пересобираем только при смене формата: раскладка зависит от размеров листа,
  // а перебирать её на каждую перерисовку списка незачем.
  const layout = useMemo(
    () => buildStarterLayout(preset, { pageWidthMm: size.widthMm, pageHeightMm: size.heightMm }),
    [preset, size.widthMm, size.heightMm],
  );

  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        aria-label={`Создать материал из заготовки «${preset.title}»`}
        className="group w-full overflow-hidden rounded-2xl bg-[var(--surface)] text-left ring-1 ring-[var(--line)] transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60"
      >
        <div className="relative aspect-[4/3] overflow-hidden border-b border-[var(--line)] bg-[var(--surface-sunken)]">
          <SheetThumbnail widthMm={size.widthMm} heightMm={size.heightMm}>
            <SheetRenderer
              layout={layout}
              pageWidthMm={size.widthMm}
              pageHeightMm={size.heightMm}
              // Заполненный лист, а не «%name»: заготовку выбирают глазами,
              // и строка с процентами не показывает, что получится.
              data={PRESET_SAMPLE}
            />
          </SheetThumbnail>
          {/* Маркер «это заготовка, а не готовый диплом» — самое лёгкое,
              что можно было сделать, не трогая сами макеты заготовок:
              одна плашка поверх превью, безо всякой новой системы
              обозначений. Насколько она заметна и где именно стоит —
              решать дизайну при блоке 7; это временный, но честный фикс. */}
          <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-[var(--surface)]/90 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-[var(--text-muted)] uppercase shadow-sm ring-1 ring-[var(--line)]">
            Образец
          </span>
          {busy && (
            <span className="absolute inset-0 grid place-items-center bg-[var(--surface)]/70 text-sm">
              Создаём…
            </span>
          )}
        </div>
        <div className="p-4">
          <h3 className="truncate font-medium">{preset.title}</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{preset.hint}</p>
        </div>
      </button>
    </li>
  );
}
