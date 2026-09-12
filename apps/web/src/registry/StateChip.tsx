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
  ok: 'bg-[var(--ok-soft)] text-[var(--ok)]',
  wait: 'bg-[var(--award-soft)] text-[var(--award)]',
  warn: 'bg-[var(--warn-soft)] text-[var(--warn)]',
  bad: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  mute: 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
};

/**
 * Точка перед словом — не украшение: на чёрно-белой печати реестра
 * и для дальтоника она единственное, что отличает метку от текста.
 */
export function StateChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}
