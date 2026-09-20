import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

/**
 * Пустое место — одно на кабинет: иконка в круге, заголовок, строка
 * объяснения и, если есть куда, кнопка. Без пунктирных рамок.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className = '',
}: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
        <Icon size={26} strokeWidth={1.75} />
      </span>
      <p className="mt-4 text-lg font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
