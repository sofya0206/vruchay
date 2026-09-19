import { GUIDE_SLIDES, HINT_IDS } from '@gramota/shared';
import { SLIDE_TITLES } from './Guide';
import { useDropOff, type DropOffRow } from './api';

/**
 * Где бросают обучение — владельцу, рядом с воронкой. На каждый слайд:
 * сколько раз открыли и какая доля не сделала действие. Длинная красная
 * полоса — чинить экран, который слайд объясняет.
 */
export function TourDropOff() {
  const q = useDropOff(true);
  if (q.isPending || !q.data) return null;
  const sum = (flow: string, step: string, action: string) =>
    q.data.rows.filter((r: DropOffRow) => r.flow === flow && r.step === step && r.action === action).reduce((t, r) => t + r.count, 0);
  const rows = [
    ...GUIDE_SLIDES.map((s) => ({ label: SLIDE_TITLES[s], shown: sum('guide', s, 'shown'), done: sum('guide', s, 'done') })),
    ...HINT_IDS.map((h) => ({ label: `Точка · ${h === 'fields' ? 'Данные' : 'Загрузка таблицы'}`, shown: sum('hint', h, 'shown'), done: sum('hint', h, 'done') })),
  ].filter((r) => r.shown > 0);
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl bg-[var(--surface-sunken)] p-5">
      <h2 className="font-serif text-lg">Где бросают обучение</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">За {q.data.days} дней: открыли и доля без действия.</p>
      <div className="mt-4 space-y-2">
        {rows.map((r) => {
          const lost = Math.max(0, r.shown - r.done) / r.shown;
          return (
            <div key={r.label} className="rounded-xl bg-[var(--surface)] p-3">
              <div className="flex items-baseline gap-3 text-sm">
                <span>{r.label}</span>
                <span className="ml-auto tabular-nums">{r.shown} · {Math.round(lost * 100)}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div className={lost >= 0.5 ? 'h-full rounded-full bg-[var(--danger)]' : 'h-full rounded-full bg-[var(--accent)]'} style={{ width: `${Math.round(lost * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
