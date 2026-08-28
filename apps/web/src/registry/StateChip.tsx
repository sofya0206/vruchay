import type { ReactNode } from 'react';
import type { Tone } from './registry-format';

/**
 * Метка состояния — своя, не общая.
 *
 * Общему `StatusChip` из `ui/` хватает трёх оттенков: «никак», «идёт»,
 * «готово». Реестру их мало: отзыв, замена и неудачная доставка — три
 * разные беды, и красить их одинаково значит скрывать разницу как раз там,
 * где она важнее всего. Общую библиотеку в этой ветке править нельзя,
 * поэтому метка живёт здесь; при слиянии её место — в `ui/`.
 */
const TONES: Record<Tone, string> = {
  ok: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  wait: 'bg-[var(--award-soft)] text-[var(--award)]',
  warn: 'bg-[var(--award-soft)] text-[var(--award)] ring-1 ring-[var(--award)]/40',
  bad: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  mute: 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
};

export function StateChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
