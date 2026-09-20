import { cn } from './cn';

/**
 * Скелетон — форма будущего содержимого вместо слова «Загрузка…».
 *
 * Человек видит, где что появится, и глаз не дёргается при подмене.
 * Читалке блоки не нужны: скрыты, вместо них одна фраза в статусе.
 * Мерцание живёт в index.css и гаснет по prefers-reduced-motion.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={cn('vru-skeleton block rounded-md', className)} />;
}

function Announce({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

/** Строки таблицы или списка: столько, сколько обычно видно на экране. */
export function SkeletonRows({
  rows = 6,
  label = 'Загружаем',
  className = '',
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('divide-y divide-line', className)}>
      <Announce label={label} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3" aria-hidden>
          <Skeleton className="h-3.5 w-[28%]" />
          <Skeleton className="h-3.5 w-[18%]" />
          <Skeleton className="h-3.5 w-[14%]" />
          <Skeleton className="ml-auto h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Карточки материалов: лист и две строки подписи. */
export function SkeletonCards({
  count = 6,
  label = 'Загружаем',
  className = '',
}: {
  count?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]',
        className,
      )}
    >
      <Announce label={label} />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card overflow-hidden" aria-hidden>
          <Skeleton className="aspect-[297/210] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Форма: подпись и поле, несколько раз. */
export function SkeletonForm({
  fields = 4,
  label = 'Загружаем',
}: {
  fields?: number;
  label?: string;
}) {
  return (
    <div className="space-y-4">
      <Announce label={label} />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2" aria-hidden>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-10 w-full rounded-control" />
        </div>
      ))}
    </div>
  );
}

/** Сводка: плитки с числами. */
export function SkeletonTiles({
  count = 4,
  label = 'Загружаем',
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Announce label={label} />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-3 p-5" aria-hidden>
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
