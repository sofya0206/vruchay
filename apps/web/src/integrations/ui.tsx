import type { ReactNode } from 'react';

/**
 * Плашки экрана интеграции.
 *
 * Каждая настройка живёт в своей карточке, а не в общем полотне: так
 * видно, где кончается одна и начинается другая, и подпись под полем
 * читается как объяснение именно к нему.
 *
 * Кегль на ступень выше прежнего: подпись поля 14 вместо 12, значение
 * в поле 18 вместо 16, пояснение остаётся 14 — оно и должно быть мельче
 * того, что объясняет. На рабочем мониторе прежние настройки приходилось
 * вычитывать, наклонясь к экрану, а ошибиться в домене или пределе
 * заявок тут стоит дорого.
 */
export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--line)]">{children}</div>
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
      <div className="rounded-lg px-4 py-2.5 ring-1 ring-[var(--line)] focus-within:ring-[var(--accent)]">
        <span className="block text-sm text-[var(--text-muted)]">{label}</span>
        {children}
      </div>
      {/* Пояснение не тянем во всю ширину карточки: строка в тысячу точек
          читается плохо, глаз теряет начало следующей. Поле — тянем, там
          важна длина значения, а не длина строки текста. */}
      {hint && <p className="mt-2.5 max-w-3xl text-sm text-[var(--text-muted)]">{hint}</p>}
    </Card>
  );
}

/** Строка ввода внутри карточки: рамку рисует карточка, поле — только текст. */
export function BareInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full bg-transparent text-lg text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
    />
  );
}
