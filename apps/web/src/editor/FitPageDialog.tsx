import { useEffect } from 'react';
import { Maximize2, X } from 'lucide-react';

/**
 * Бланк не тех пропорций, что лист.
 *
 * Спрашиваем сразу после загрузки. Молча растянуть нельзя: перекошенная
 * грамота выпускается ровно так же успешно, как правильная, и брак
 * обнаруживает получатель — когда переделывать поздно.
 *
 * Показываем оба прямоугольника рядом. Словами «пропорции не совпадают»
 * объяснить это трудно, а глазами видно сразу.
 */
export function FitPageDialog({
  current,
  suggested,
  onFit,
  onKeep,
}: {
  current: { widthMm: number; heightMm: number };
  suggested: { widthMm: number; heightMm: number };
  onFit: () => void;
  onKeep: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onKeep();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKeep]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--scrim)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Размер бланка не совпадает с листом"
      onClick={(e) => e.target === e.currentTarget && onKeep()}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-[var(--surface)]">
        <header className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="font-serif text-lg">Бланк другого размера</h2>
          <button
            onClick={onKeep}
            aria-label="Закрыть"
            className="ml-auto text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <p className="text-sm text-[var(--text-muted)]">
            Пропорции картинки не совпадают с листом — если оставить как есть, бланк
            растянется и герб с рамкой перекосятся.
          </p>

          <div className="flex items-end justify-center gap-6 rounded-xl bg-[var(--surface-sunken)] px-4 py-5">
            <Shape {...current} caption="Лист сейчас" />
            <Shape {...suggested} caption="Бланк" accent />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={onFit}
              className="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left ring-1 ring-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]"
            >
              <Maximize2 size={19} className="mt-0.5 text-[var(--accent)]" />
              <span>
                <span className="block font-medium">
                  Подогнать лист: {suggested.widthMm}×{suggested.heightMm} мм
                </span>
                <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
                  Бланк встанет без искажений. Уже расставленный текст сдвинется —
                  проверьте макет.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onKeep}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-[var(--text-muted)] ring-1 ring-[var(--line-strong)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              Оставить лист {current.widthMm}×{current.heightMm} мм — бланк растянется
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Прямоугольник в пропорциях листа: сравнение глазами, а не по числам. */
function Shape({
  widthMm,
  heightMm,
  caption,
  accent = false,
}: {
  widthMm: number;
  heightMm: number;
  caption: string;
  accent?: boolean;
}) {
  // Вписываем в квадрат 88×88 — так оба прямоугольника сравнимы между собой.
  const scale = 88 / Math.max(widthMm, heightMm);

  return (
    <div className="text-center">
      <div
        style={{ width: widthMm * scale, height: heightMm * scale }}
        className={`mx-auto rounded ${
          accent
            ? 'bg-[var(--accent)]/20 ring-1 ring-[var(--accent)]'
            : 'bg-[var(--surface)] ring-1 ring-[var(--line-strong)]'
        }`}
      />
      <p className="mt-2 text-xs text-[var(--text-muted)]">{caption}</p>
      <p className="tabular text-xs text-[var(--text-muted)]">
        {widthMm}×{heightMm}
      </p>
    </div>
  );
}
