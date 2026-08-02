import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import source from '../legal/privacy.md?raw';
import { renderMarkdown } from '../legal/markdown';

/**
 * Политика обработки персональных данных.
 *
 * Публикуется по постоянному адресу /privacy: закон требует именно
 * неограниченного доступа к документу (ч. 2 ст. 18.1 152-ФЗ), поэтому
 * страница открыта без входа в систему.
 *
 * Данные предпринимателя подставляются при сборке из переменных окружения,
 * а не лежат в репозитории: адрес регистрации ИП — это домашний адрес
 * человека. На опубликованной странице он всё равно будет — этого требует
 * закон, — но храниться в истории изменений ему незачем.
 */

const OPERATOR: Record<string, string | undefined> = {
  НАИМЕНОВАНИЕ: import.meta.env.VITE_OPERATOR_NAME,
  ИНН: import.meta.env.VITE_OPERATOR_INN,
  ОГРНИП: import.meta.env.VITE_OPERATOR_OGRNIP,
  АДРЕС: import.meta.env.VITE_OPERATOR_ADDRESS,
  EMAIL: import.meta.env.VITE_OPERATOR_EMAIL,
  ТЕЛЕФОН: import.meta.env.VITE_OPERATOR_PHONE,
  ДАТА_РЕДАКЦИИ: import.meta.env.VITE_POLICY_DATE,
};

function fill(text: string): { filled: string; missing: string[] } {
  const missing: string[] = [];
  const filled = text.replace(/\{\{([A-ZА-ЯЁ_]+)\}\}/g, (whole, name: string) => {
    const value = OPERATOR[name];
    if (!value) {
      missing.push(name);
      return whole;
    }
    return value;
  });
  return { filled, missing: [...new Set(missing)] };
}

export function PrivacyPage() {
  const { filled, missing } = fill(source);

  return (
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
  );
}
