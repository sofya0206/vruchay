import type { ReactNode } from 'react';

/**
 * Плашки экрана интеграции.
 *
 * Каждая настройка живёт в своей карточке, а не в общем полотне: так
 * видно, где кончается одна и начинается другая, и подпись под полем
 * читается как объяснение именно к нему.
 */
export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">{children}</div>
  );
}

/**
 * Карточка с полем ввода.
 *
 * Метка стоит внутри рамки над строкой ввода — она остаётся видна и после
 * того, как поле заполнено, поэтому по заполненной форме понятно, что где.
 */
export function FieldCard({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="rounded-lg px-3 py-2 ring-1 ring-[var(--line)] focus-within:ring-[var(--accent)]">
        <span className="block text-xs text-[var(--text-muted)]">{label}</span>
        {children}
      </div>
      {hint && <p className="mt-2 text-sm text-[var(--text-muted)]">{hint}</p>}
    </Card>
  );
}

/** Строка ввода внутри карточки: рамку рисует карточка, поле — только текст. */
export function BareInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-transparent text-base text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
    />
  );
}
