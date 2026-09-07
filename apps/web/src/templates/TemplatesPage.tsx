import { LayoutTemplate, User } from 'lucide-react';
import { LibraryLayout } from '../documents/LibraryNav';

/**
 * Раздел «Шаблоны».
 *
 * Пока пустой намеренно: показывать здесь нечего, а подложить в витрину
 * первые попавшиеся макеты — значит один раз испортить впечатление
 * о сервисе. Место под каталог размечено, наполнение придёт отдельно.
 */
export function TemplatesPage({ mine = false }: { mine?: boolean }) {
  return (
    <LibraryLayout>
      <h1 className="text-2xl font-semibold">{mine ? 'Мои шаблоны' : 'Шаблоны'}</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {mine
          ? 'Свои бланки: загруженные и сохранённые из каталога'
          : 'Готовые бланки: грамоты, дипломы, сертификаты'}
      </p>

      <div className="mt-6 rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-16 text-center">
        {mine ? (
          <User size={28} className="mx-auto mb-3 text-[var(--text-muted)]" strokeWidth={1.5} />
        ) : (
          <LayoutTemplate
            size={28}
            className="mx-auto mb-3 text-[var(--text-muted)]"
            strokeWidth={1.5}
          />
        )}
        <p className="font-medium">{mine ? 'Своих шаблонов пока нет' : 'Каталог пока пуст'}</p>
      </div>
    </LibraryLayout>
  );
}
