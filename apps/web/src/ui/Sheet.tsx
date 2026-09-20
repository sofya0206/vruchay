import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { cn } from './cn';
import { focusFirst, useOverlayState, useScrollLock } from './overlay/useOverlayState';

const ENTER_MS = 320;
const EXIT_MS = 220;

const widths = { sm: 'w-80', md: 'w-[30rem]' } as const;

/**
 * Боковая шторка — панель, которая приезжает от края и не меняет
 * контекст страницы: история документа, письмо из журнала, меню
 * разделов на телефоне.
 *
 * Тот же нативный `<dialog>`, что у окна и нижнего листа. Уходит туда
 * же, откуда пришла: что приехало справа, уезжает направо.
 */
export function Sheet({
  open,
  onClose,
  title,
  side = 'right',
  width = 'md',
  children,
  footer,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: 'left' | 'right';
  width?: keyof typeof widths;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { mounted, shown } = useOverlayState(open, EXIT_MS);
  useScrollLock(mounted);

  useEffect(() => {
    const el = dialog.current;
    if (!mounted || !el) return;
    if (!el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    focusFirst(panel.current);
    return () => {
      if (el.open) el.close();
    };
  }, [mounted]);

  if (!mounted) return null;

  const hidden = side === 'right' ? 'translateX(100%)' : 'translateX(-100%)';

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Esc ловим и сами: событие cancel у диалога приходит не во всех
      // сборках Chromium, а закрываться клавишей окно обязано всегда.
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-ink backdrop:bg-transparent"
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-scrim"
        style={{ opacity: shown ? 1 : 0, transition: `opacity ${shown ? ENTER_MS : EXIT_MS}ms var(--ease-out)` }}
      />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex max-w-[92vw] flex-col bg-surface shadow-lg outline-none',
          side === 'right' ? 'right-0 border-l border-line' : 'left-0 border-r border-line',
          widths[width],
          className,
        )}
        style={{
          transform: shown ? 'none' : hidden,
          transition: `transform ${shown ? ENTER_MS : EXIT_MS}ms var(--ease-drawer)`,
        }}
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-medium">{title}</h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        {footer && <footer className="flex shrink-0 gap-2 border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </dialog>
  );
}
