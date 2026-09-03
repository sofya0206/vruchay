import { Link } from 'react-router-dom';
import { ArrowLeft, FileWarning } from 'lucide-react';
import { renderMarkdown } from './markdown';
import { fill, splitDraft } from './fill';
import { Meta } from '../seo/Meta';

/**
 * Страница юридического документа.
 *
 * Один вид на все документы, кроме политики: она появилась раньше и живёт
 * своей страницей. Здесь важны две вещи, которые легко потерять.
 *
 * Первая — незаполненные данные предпринимателя. Документ без них
 * юридически не работает, но выглядит готовым, поэтому о них сообщается
 * красным блоком, а не молчанием.
 *
 * Вторая — пометка «черновик». Черновик договора, опубликованный без
 * предупреждения, хуже отсутствующего: на него сошлются. Пометка стоит
 * первой строкой файла и превращается здесь в предупреждение, а не
 * в абзац посреди договора.
 */

interface Props {
  source: string;
  title: string;
  description: string;
  path: string;
}

export function LegalDocument({ source, title, description, path }: Props) {
  const { draft, body } = splitDraft(source);
  const { filled, missing } = fill(body);

  return (
    <>
      <Meta title={title} description={description} path={path} noindex={draft} />
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
          {draft && (
            <p className="mb-6 flex gap-3 rounded-xl bg-[var(--award-soft)] p-4 text-sm leading-relaxed">
              <FileWarning size={18} className="mt-0.5 shrink-0 text-[var(--award)]" />
              <span>
                <strong>Черновик, не проверенный юристом.</strong> Текст опубликован для работы над
                ним и ссылаться на него как на действующий договор нельзя. Страница закрыта от
                индексации до проверки.
              </span>
            </p>
          )}
          {missing.length > 0 && (
            <p className="mb-6 rounded-xl bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
              Документ опубликован не полностью: не заданы {missing.join(', ')}. Задайте переменные
              VITE_OPERATOR_* при сборке приложения.
            </p>
          )}
          {renderMarkdown(filled)}
        </main>
      </div>
    </>
  );
}
