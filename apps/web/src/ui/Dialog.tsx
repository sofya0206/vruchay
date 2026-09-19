import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { IconButton } from './IconButton';

/** Окно поверх страницы — одно на кабинет. */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      // На телефоне окно прижато к низу и во всю ширину — как нижний лист:
      // кнопки подтверждения оказываются под большим пальцем, а не посреди экрана.
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--scrim)] p-4 max-sm:place-items-end max-sm:p-0"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-lg max-sm:max-h-[85vh] max-sm:rounded-b-none ${
          wide ? 'max-w-4xl' : 'max-w-xl'
        }`}
      >
        <header className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3">
          <h2 className="min-w-0 truncate text-lg font-medium">{title}</h2>
          <IconButton className="ml-auto" label="Закрыть" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>

        {footer && (
          <footer
            className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 pt-3 max-sm:flex-col-reverse max-sm:items-stretch max-sm:[&>*]:h-11"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
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
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children && <div className="text-[var(--text-muted)]">{children}</div>}
    </Dialog>
  );
}
