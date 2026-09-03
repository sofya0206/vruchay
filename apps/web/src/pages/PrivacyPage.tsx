import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import source from '../legal/privacy.md?raw';
import { renderMarkdown } from '../legal/markdown';
import { fill } from '../legal/fill';
import { Meta } from '../seo/Meta';

/**
 * Политика обработки персональных данных.
 *
 * Публикуется по постоянному адресу /privacy: закон требует именно
 * неограниченного доступа к документу (ч. 2 ст. 18.1 152-ФЗ), поэтому
 * страница открыта без входа в систему.
 *
 * Данные предпринимателя подставляются при сборке — см. legal/fill.ts.
 */

export { fill };

export function PrivacyPage() {
  const { filled, missing } = fill(source);

  return (
    <>
      <Meta
        title="Политика обработки персональных данных — Вручай"
        description="Как сервис «Вручай» обрабатывает персональные данные участников и заказчиков: цели, сроки хранения, права субъекта."
        path="/privacy"
      />
    <div className="min-h-full bg-[var(--ground)]">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={16} />
            Вручай
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {missing.length > 0 && (
          // Незаполненные поля — это не косметика: документ без данных
          // оператора юридически не работает. Говорим об этом громко.
          <p className="mb-6 rounded-xl bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
            Документ опубликован не полностью: не заданы {missing.join(', ')}. Задайте
            переменные VITE_OPERATOR_* при сборке приложения.
          </p>
        )}
        {renderMarkdown(filled)}
      </main>
    </div>
    </>
  );
}
