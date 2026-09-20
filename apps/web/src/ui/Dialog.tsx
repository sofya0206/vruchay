import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { BottomSheet } from './BottomSheet';
import { cn } from './cn';
import { focusFirst, useOverlayState, useScrollLock } from './overlay/useOverlayState';
import { usePhone } from './useMediaQuery';

const ENTER_MS = 240;

type Size = 'sm' | 'md' | 'lg';
const widths: Record<Size, string> = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-4xl' };

/**
 * Окно поверх страницы — одно на кабинет.
 *
 * Нативный `<dialog>` с `showModal()`: верхний слой, Esc, недоступный
 * фон и возврат фокуса опенеру браузер даёт сам, без своей ловушки.
 * Затемнение рисуем внутри диалога, а не через `::backdrop` — у
 * псевдоэлемента нет анимации появления в Safari до 17.5.
 *
 * Появляется от центра, с 0.96, а не из нуля: ничто в мире не возникает
 * из точки. На телефоне то же окно становится нижним листом: кнопки
 * подтверждения под большим пальцем, а не посреди экрана.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  wide,
  dismissible = true,
  className = '',
}: {
  title: string;
  /** Одна строка под заголовком — зачем это окно. */
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: Size;
  /** Прежнее имя широкого окна. */
  wide?: boolean;
  /** Закрывается ли нажатием мимо и Esc. Нет — только своей кнопкой. */
  dismissible?: boolean;
  className?: string;
}) {
  const phone = usePhone();
  if (phone) {
    return (
      <BottomSheet open onClose={onClose} title={title} footer={footer}>
        <div className="px-3 pt-1">
          {description && <p className="mb-3 text-sm text-muted">{description}</p>}
          {children}
        </div>
      </BottomSheet>
    );
  }
  return (
    <DesktopDialog
      title={title}
      description={description}
      onClose={onClose}
      footer={footer}
      size={wide ? 'lg' : size}
      dismissible={dismissible}
      className={className}
    >
      {children}
    </DesktopDialog>
  );
}

function DesktopDialog({
  title,
  description,
  onClose,
  children,
  footer,
  size,
  dismissible,
  className,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size: Size;
  dismissible: boolean;
  className: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { shown } = useOverlayState(true, ENTER_MS);
  useScrollLock(true);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    focusFirst(panel.current);
    return () => {
      if (el.open) el.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      // Esc ловим и сами: событие cancel у диалога приходит не во всех
      // сборках Chromium, а закрываться клавишей окно обязано всегда.
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        if (dismissible) onClose();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-ink backdrop:bg-transparent"
    >
      <div
        aria-hidden
        onClick={dismissible ? onClose : undefined}
        className="absolute inset-0 bg-scrim"
        style={{ opacity: shown ? 1 : 0, transition: `opacity ${ENTER_MS}ms var(--ease-out)` }}
      />
      <div className="absolute inset-0 grid place-items-center p-4" onClick={dismissible ? onClose : undefined}>
        <div
          ref={panel}
          role="document"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'flex max-h-full w-full flex-col overflow-hidden rounded-sheet bg-raised shadow-lg outline-none',
            widths[size],
            className,
          )}
          style={{
            opacity: shown ? 1 : 0,
            transform: shown ? 'none' : 'scale(0.96)',
            transition: `opacity ${ENTER_MS}ms var(--ease-out), transform ${ENTER_MS}ms var(--ease-out)`,
          }}
        >
          <header className="flex items-start gap-3 border-b border-line px-5 py-3">
            <div className="min-w-0 flex-1 pt-1.5">
              <h2 className="truncate text-lg font-medium leading-tight">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <IconButton label="Закрыть" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </header>

          <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>

          {footer && (
            <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>
          )}
        </div>
      </div>
    </dialog>
  );
}

/**
 * Вопрос с двумя ответами вместо `window.confirm`: свой заголовок,
 * объяснение, кнопка действия названа по делу, опасное — красным.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  /** Отказ сервера. Окно остаётся открытым — иначе оно просто стояло бы без ответа. */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children && <div className="text-muted">{children}</div>}
      {error && (
        <p role="alert" className="mt-3 rounded-control bg-danger-soft p-3 text-danger">
          {error}
        </p>
      )}
    </Dialog>
  );
}
