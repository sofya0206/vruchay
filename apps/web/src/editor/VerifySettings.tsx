import { BadgeCheck, Eye, EyeOff, QrCode } from 'lucide-react';
import { useRecipients } from '../api/recipients';
import { Toggle } from '../ui/Field';
import { cn } from '../ui/cn';
import type { DocumentDetail } from '../api/types';

/** Подписи — те же, что на самой странице проверки. */
const FIELD_LABEL: Record<string, string> = {
  name: 'Кому выдан',
  email: 'Почта',
  place: 'Результат',
  city: 'Город',
  club: 'Клуб',
  team: 'Команда',
};

/** Пример значения в превью: пустые строки читались бы как поломка. */
const SAMPLE: Record<string, string> = {
  name: 'Иванова Анна',
  email: 'anna@mail.ru',
  place: '1 место',
  city: 'Казань',
};

/**
 * Что видит посторонний, проверяя документ по QR.
 *
 * Не список галочек с абзацами пояснений, а уменьшенная страница проверки:
 * строка с глазом — видна, перечёркнутая — скрыта. Так панели Credly
 * и Accredible — одним переключателем «видно или нет», только у нас
 * ещё и по полям.
 *
 * По умолчанию не отмечено ничего: страница открыта без входа, и всё
 * отмеченное здесь видно любому, кто знает код. Фамилию показать уместно —
 * она и так напечатана на бумаге; почту — нет, иначе перебор кодов
 * превращается в выгрузку списка участников.
 */
export function VerifySettings({
  doc,
  onSave,
}: {
  doc: DocumentDetail;
  onSave: (values: { verifyEnabled?: boolean; verifyFields?: string[] }) => void;
}) {
  // Тот же запрос, что у таблицы получателей: колонки нужны обеим.
  const table = useRecipients(doc.id);
  const columns = table.data?.columns ?? [];
  const fields = doc.verifyFields ?? [];

  function toggleField(name: string) {
    onSave({
      verifyFields: fields.includes(name) ? fields.filter((f) => f !== name) : [...fields, name],
    });
  }

  return (
    <div className="space-y-4">
      <Toggle
        checked={doc.verifyEnabled}
        onChange={(checked) => onSave({ verifyEnabled: checked })}
        label={
          <span className="inline-flex items-center gap-1.5">
            <QrCode size={16} className="text-muted" />
            Проверка по QR
          </span>
        }
      />

      <div
        className={cn(
          'rounded-sheet bg-ground p-3 transition-opacity',
          !doc.verifyEnabled && 'pointer-events-none opacity-40',
        )}
        aria-hidden={!doc.verifyEnabled}
      >
        <div className="rounded-card bg-surface p-4 text-center shadow-sm ring-1 ring-line">
          <BadgeCheck size={24} strokeWidth={1.75} className="mx-auto text-accent" />
          <p className="mt-1.5 font-serif text-base">Документ подлинный</p>
          <p className="truncate text-xs text-muted">{doc.title}</p>

          <ul className="mt-3 space-y-0.5 border-t border-line pt-2 text-left text-xs">
            {columns.map((col) => {
              const shown = fields.includes(col.name);
              const label = FIELD_LABEL[col.name] ?? col.title ?? col.name;
              return (
                <li key={col.id}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={shown}
                    aria-label={`${label}: ${shown ? 'видно' : 'скрыто'}`}
                    onClick={() => toggleField(col.name)}
                    className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-control px-1.5 py-1 transition-colors hover:bg-sunken"
                  >
                    <span className="shrink-0 text-muted">{label}</span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-right font-medium',
                        !shown && 'text-muted line-through decoration-line-strong',
                      )}
                    >
                      {shown ? (SAMPLE[col.name] ?? '…') : '••••••'}
                    </span>
                    {shown ? (
                      <Eye size={16} className="shrink-0 text-accent" />
                    ) : (
                      <EyeOff size={16} className="shrink-0 text-muted" />
                    )}
                  </button>
                </li>
              );
            })}
            {/* Дата выдачи видна всегда — без неё проверка ничего не подтверждает. */}
            <li className="flex items-center gap-2 px-0 py-1">
              <span className="text-muted">Выдан</span>
              <span className="tabular flex-1 text-right font-medium">17.06.2026</span>
              <span className="size-4 shrink-0" />
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
