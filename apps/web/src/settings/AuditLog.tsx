import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useAudit, type AuditEvent } from '../api/audit';
import { Button } from '../ui/Button';

const PAGE = 50;

/**
 * Журнал действий организации.
 *
 * Нужен для разбора спорных случаев: кто выпустил документ не тому
 * участнику, кто удалил материал перед отчётом, кто отозвал проверку.
 * Поэтому пишем не всё подряд, а только то, у чего есть последствия
 * снаружи, — в потоке из «открыл страницу» и «подвинул блок» нужное
 * не найти.
 *
 * Показываем владельцу и управляющему: журнал говорит, кто из
 * сотрудников что делал, и открывать его всем — значит превращать
 * рабочий инструмент в средство наблюдения друг за другом.
 */
export function AuditLog() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isError } = useAudit(offset, PAGE);

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <ScrollText size={18} className="text-[var(--text-muted)]" />
        Журнал действий
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)] max-md:hidden">
        Что делали в организации: выпуск документов, рассылки, удаления, изменения в составе
        сотрудников. Пригодится, когда нужно разобраться, кто и когда что сделал. Время
        московское.
      </p>

      {isLoading && <p className="mt-4 text-sm text-[var(--text-muted)]">Загружаем…</p>}

      {isError && (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Журнал доступен владельцу и управляющему.
        </p>
      )}

      {data && data.total === 0 && (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Пока пусто. Здесь появятся записи, как только кто-нибудь выпустит документы или разошлёт
          письма.
        </p>
      )}

      {data && data.total > 0 && (
        <>
          <ul className="mt-4 max-w-2xl divide-y divide-[var(--line)] rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--line)]">
            {data.items.map((event) => (
              <Row key={event.id} event={event} />
            ))}
          </ul>

          <div className="mt-3 flex max-w-2xl items-center gap-3">
            <span className="text-sm text-[var(--text-muted)]">
              {offset + 1}–{Math.min(offset + PAGE, data.total)} из {data.total}
            </span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" disabled={offset === 0} onClick={() => setOffset(offset - PAGE)}>
                Новее
              </Button>
              <Button
                size="sm"
                disabled={offset + PAGE >= data.total}
                onClick={() => setOffset(offset + PAGE)}
              >
                Старее
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Row({ event }: { event: AuditEvent }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
      <span className="tabular shrink-0 text-[var(--text-muted)]">{when(event.createdAt)}</span>
      <span>{event.summary}</span>
      <span className="ml-auto text-[var(--text-muted)]">
        {event.actorName || event.actorEmail || 'сервис'}
      </span>
    </li>
  );
}

/**
 * Время по Москве — единое для всех, а не по часам смотрящего.
 *
 * Организации у нас от Калининграда до Владивостока: если время показывать
 * местное, два человека, обсуждающие одну и ту же запись, увидят разные
 * часы — ровно в том разговоре, ради которого журнал и заведён. Что оно
 * московское, сказано в описании раздела.
 */
function when(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(new Date(iso));
}
