import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';

/**
 * Окно поверх страницы.
 *
 * Своё, а не из общей библиотеки: общие компоненты в этой ветке заводит
 * задача про оболочку, и лезть в `ui/` параллельно значит гарантировать
 * конфликт при слиянии. Когда оболочка приедет, это окно заменится
 * общим одним движением.
 */
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
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-2xl bg-[var(--surface)] ${
          wide ? 'max-w-4xl' : 'max-w-xl'
        }`}
      >
        <header className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <h2 className="min-w-0 truncate font-medium">{title}</h2>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            icon={<X size={16} />}
            onClick={onClose}
            aria-label="Закрыть"
          />
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>

        {footer && (
          <footer className="flex items-center gap-3 border-t border-[var(--line)] px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
