import type { ReactNode } from 'react';
import { Input, Label } from '../ui/Field';

/**
 * Плашки экрана интеграции — тонкие обёртки над общим китом.
 *
 * Каждая настройка живёт в своей карточке, а не в общем полотне: так
 * видно, где кончается одна и начинается другая, и подпись под полем
 * читается как объяснение именно к нему.
 */
export function Card({ children }: { children: ReactNode }) {
  return <div className="card p-5">{children}</div>;
}

/** Карточка с одним полем: подпись, поле, пояснение под ним. */
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
      <Label>{label}</Label>
      {children}
      {/* Пояснение не тянем во всю ширину карточки: строка в тысячу точек
          читается плохо, глаз теряет начало следующей. */}
      {hint && <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">{hint}</p>}
    </Card>
  );
}

/** Поле внутри карточки — обычное поле кита. */
export function BareInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} />;
}
