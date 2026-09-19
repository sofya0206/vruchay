import { GraduationCap } from 'lucide-react';
import { useTooltip } from '../ui/Tooltip';
import { cn } from '../ui/cn';
import { onboarding } from './store';

/** «Обучение» внизу колонки разделов: открывает полноэкранное обучение. */
export function LearnNavItem({ collapsed, onDone }: { collapsed?: boolean; onDone?: () => void }) {
  const tip = useTooltip(collapsed ? 'Обучение' : undefined, { placement: 'right' });
  return (
    <button
      type="button"
      onClick={() => {
        onboarding.open();
        onDone?.();
      }}
      {...tip.triggerProps}
      aria-label={collapsed ? 'Обучение' : undefined}
      className={cn(
        'flex h-11 w-full items-center gap-3 rounded-xl text-base text-[var(--text)] transition-colors hover:bg-[var(--surface-sunken)]',
        collapsed ? 'justify-center' : 'px-3',
      )}
    >
      <GraduationCap size={20} strokeWidth={1.75} className="shrink-0" />
      {!collapsed && <span className="truncate">Обучение</span>}
      {tip.tooltip}
    </button>
  );
}
