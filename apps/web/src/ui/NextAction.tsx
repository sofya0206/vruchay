import { isValidElement, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';

export interface Action {
  label: string;
  onClick?: () => void;
  to?: string;
  icon?: ReactNode;
}

function renderAction(action: Action | ReactNode, variant: 'primary' | 'secondary') {
  if (isValidElement(action) || action == null || typeof action !== 'object') return action as ReactNode;
  const a = action as Action;
  return (
    <Button variant={variant} to={a.to} onClick={a.onClick} icon={a.icon}>
      {a.label}
    </Button>
  );
}

/**
 * Следующее действие — вместо «здесь пока пусто».
 *
 * Пустое место в кабинете не сообщение, а приглашение: заголовок
 * говорит, что сделать («Загрузите список получателей»), и тут же
 * стоит кнопка, которая это делает. Объяснение — одной строкой, если
 * без него не понять. Без пунктирных рамок и грустных иллюстраций.
 */
export function NextAction({
  icon: Icon,
  title,
  text,
  primary,
  secondary,
  compact = false,
  className = '',
  children,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  text?: ReactNode;
  /** Главная кнопка — одна. Можно передать готовый элемент. */
  primary?: Action | ReactNode;
  secondary?: Action | ReactNode;
  /** Внутри карточки или строки: меньше воздуха и значок мельче. */
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn('flex flex-col items-center px-6 text-center', compact ? 'py-6' : 'py-12', className)}
    >
      {Icon && (
        <span
          className={cn(
            'grid place-items-center rounded-full bg-accent-soft text-accent',
            compact ? 'size-10' : 'size-14',
          )}
        >
          <Icon size={compact ? 20 : 24} strokeWidth={1.75} aria-hidden />
        </span>
      )}
      <p className={cn('font-medium', compact ? 'mt-3 text-base' : 'mt-4 text-lg')}>{title}</p>
      {text && <div className="mt-1 max-w-md text-sm text-muted">{text}</div>}
      {children}
      {(primary || secondary) && (
        <div className={cn('flex flex-wrap justify-center gap-2', compact ? 'mt-4' : 'mt-5')}>
          {renderAction(primary, 'primary')}
          {renderAction(secondary, 'secondary')}
        </div>
      )}
    </div>
  );
}
