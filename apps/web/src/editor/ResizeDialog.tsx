import { useEffect, useState } from 'react';
import { Maximize2, Move, Square, X } from 'lucide-react';
import { describeSize } from '@gramota/shared';
import type { ResizeMode } from './page-fit';

/**
 * Смена размера листа — с вопросом, что делать с уже расставленными блоками.
 *
 * Молча оставить как есть нельзя: макет под A4 на A5 вылезает за края,
 * и заметно это будет на печати. Молча масштабировать тоже нельзя:
 * кегль на бланке подобран сознательно. Поэтому три варианта, каждый
 * объяснён словами и последствием.
 */
export function ResizeDialog({
  from,
  to,
  onApply,
  onCancel,
}: {
  from: { widthMm: number; heightMm: number };
  to: { widthMm: number; heightMm: number };
  onApply: (mode: ResizeMode) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<ResizeMode>('scale');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const options: { id: ResizeMode; icon: React.ReactNode; title: string; hint: string }[] = [
    {
      id: 'scale',
      icon: <Maximize2 size={18} />,
      title: 'Пропорционально — всё вместе',
      hint: 'Положения, размеры и кегли изменятся в одной пропорции. Композиция останется той же.',
    },
    {
      id: 'reposition',
      icon: <Move size={18} />,
      title: 'Сохранить кегли, пересчитать только положения',
      hint: 'Шрифт и размеры блоков останутся, блоки встанут на те же доли нового листа.',
    },
    {
      id: 'keep',
      icon: <Square size={18} />,
      title: 'Ничего не трогать',
      hint: 'Блоки останутся на своих миллиметрах; те, что вылезли за лист, будут отмечены.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Смена размера листа"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-[var(--surface)]">
        <header className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="font-serif text-lg">Новый размер листа</h2>
          <button onClick={onCancel} aria-label="Закрыть" className="ml-auto text-[var(--text-muted)] hover:text-[var(--text)]">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <p className="text-sm text-[var(--text-muted)]">
            {describeSize(from)} → {describeSize(to)}. Что сделать с блоками, которые уже стоят на листе?
          </p>

          <div className="space-y-2" role="radiogroup" aria-label="Что сделать с блоками">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={mode === o.id}
                onClick={() => setMode(o.id)}
                className={`flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left ring-1 transition-colors ${
                  mode === o.id ? 'bg-[var(--accent-soft)] ring-[var(--accent)]' : 'ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]'
                }`}
              >
                <span className={`mt-0.5 ${mode === o.id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>{o.icon}</span>
                <span>
                  <span className="block font-medium">{o.title}</span>
                  <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{o.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-4 py-2 text-sm text-[var(--text-muted)] ring-1 ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => onApply(mode)}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]"
            >
              Применить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
