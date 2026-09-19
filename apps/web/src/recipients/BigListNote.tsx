import { useState } from 'react';
import { Monitor, X } from 'lucide-react';

const KEY = 'vruchay.big-list-note-dismissed';

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Список получателей на телефоне: честно говорим, что умеет, а что нет.
 *
 * Таблица на тысячи строк с правкой ячеек — работа для большого экрана,
 * и притворяться, что это удобно с телефона, мы не станем. А отметить
 * получателей и выпустить — можно и нужно: это и делают на мероприятии.
 * Только на узком экране; закрытая полоса больше не показывается.
 */
export function BigListNote() {
  const [hidden, setHidden] = useState(dismissedBefore);
  if (hidden) return null;
  return (
    <div role="note" className="flex shrink-0 items-start gap-3 border-b border-[var(--line)] bg-[var(--surface-blue)] px-4 py-2.5 text-sm md:hidden">
      <Monitor size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
      <p className="min-w-0 flex-1">
        Загрузить большой список и править его по ячейкам удобнее с компьютера. С телефона — отметить
        получателей и выпустить.
      </p>
      <button
        type="button"
        aria-label="Понятно, скрыть"
        onClick={() => {
          try {
            localStorage.setItem(KEY, '1');
          } catch {
            // Приватный режим — полоса вернётся в следующий раз, это не беда.
          }
          setHidden(true);
        }}
        className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-lg text-[var(--text-muted)]"
      >
        <X size={16} />
      </button>
    </div>
  );
}
