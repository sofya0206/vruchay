import { ShieldCheck } from 'lucide-react';
import { useRecipients } from '../api/recipients';
import type { DocumentDetail } from '../api/types';

const COLUMN_TITLE: Record<string, string> = {
  name: 'ФИО',
  email: 'Адрес почты',
};

/**
 * Что видит посторонний, проверяя документ по QR.
 *
 * Раздел нужен вот почему: страница проверки существует с самого начала,
 * но показывать на ней было нечего — выбирать поля было негде, и любой
 * документ подтверждался безымянно. Работодателю, который сверяет диплом
 * с бумагой в руках, «документ подлинный» без фамилии не отвечает
 * на его вопрос.
 *
 * Отмечать поля надо руками, и по умолчанию не отмечено ничего. Это не
 * лень: страница открыта без входа, и всё отмеченное здесь становится
 * доступно любому, кто знает код. Фамилию показать уместно — она и так
 * напечатана на предъявленной бумаге; адрес почты и телефон — нет,
 * иначе перебор кодов превращается в выгрузку списка участников.
 */
export function VerifySettings({
  doc,
  onSave,
}: {
  doc: DocumentDetail;
  onSave: (values: { verifyEnabled?: boolean; verifyFields?: string[] }) => void;
}) {
  // Берём тот же запрос, что и таблица получателей: колонки нужны обеим,
  // а второй запрос за теми же данными — это лишний поход на сервер
  // при каждом открытии редактора.
  const table = useRecipients(doc.id);
  const columns = table.data?.columns ?? [];

  const fields = doc.verifyFields ?? [];

  function toggleField(name: string) {
    onSave({
      verifyFields: fields.includes(name) ? fields.filter((f) => f !== name) : [...fields, name],
    });
  }

  return (
    <div className="space-y-3 border-t border-[var(--line)] pt-4">
      <h3 className="flex items-center gap-2 font-medium">
        <ShieldCheck size={16} className="text-[var(--text-muted)]" />
        Проверка по QR
      </h3>

      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={doc.verifyEnabled}
          onChange={(e) => onSave({ verifyEnabled: e.target.checked })}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span>
          Разрешить проверку
          <span className="mt-0.5 block text-[var(--text-muted)]">
            Посторонний сканирует QR с документа и видит, что он настоящий.
          </span>
        </span>
      </label>

      {doc.verifyEnabled && (
        <div>
          <p className="text-sm text-[var(--text-muted)]">
            Что показывать проверяющему, кроме самого факта подлинности:
          </p>

          {columns.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {columns.map((col) => (
                <label key={col.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fields.includes(col.name)}
                    onChange={() => toggleField(col.name)}
                    className="accent-[var(--accent)]"
                  />
                  {COLUMN_TITLE[col.name] ?? col.name}
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Колонки появятся, когда вы заполните список получателей.
            </p>
          )}

          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Страницу может открыть любой, у кого есть код с документа. Фамилию показывать
            обычно нужно — она и так напечатана на бумаге. Адрес почты и телефон лучше
            не показывать.
          </p>
        </div>
      )}
    </div>
  );
}
