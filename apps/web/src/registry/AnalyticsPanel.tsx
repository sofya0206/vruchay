import { Loading } from '../ui/Loading';
import type { RegistryAnalytics, RegistryFilters } from '../api/registry';
import { useRegistryAnalytics } from '../api/registry';
import { plural } from './registry-format';

/**
 * Сводка по жизни выданного.
 *
 * Считается по тому же отбору, что и таблица: цифры, относящиеся не к тому,
 * что человек видит, вводят в заблуждение вернее, чем их отсутствие.
 *
 * Здесь только то, что и так собиралось: выпуск, письма, скачивания
 * и проверки по QR. Личных сведений о получателях и о тех, кто проверяет
 * документы, в сводке нет и быть не может — мы обработчик персональных
 * данных по поручению организации, а не самостоятельный оператор.
 */
export function AnalyticsPanel({ filters, active }: { filters: RegistryFilters; active: boolean }) {
  const analytics = useRegistryAnalytics(filters, active);

  if (analytics.isPending) return <Loading label="Считаем" />;
  if (analytics.isError || !analytics.data) {
    return <p className="text-sm text-[var(--text-muted)]">Сводку сейчас не посчитать.</p>;
  }

  const data = analytics.data;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 font-serif text-lg">Проверки по QR-коду</h2>
        <div className="rounded-2xl bg-[var(--accent-soft)] p-5">
          <p className="text-3xl text-[var(--accent)] tabular-nums">
            {data.verifications.total.toLocaleString('ru-RU')}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {plural(data.verifications.total, 'проверка', 'проверки', 'проверок')} у{' '}
            {data.verifications.files.toLocaleString('ru-RU')}{' '}
            {plural(data.verifications.files, 'документа', 'документов', 'документов')} из{' '}
            {data.issued.toLocaleString('ru-RU')}
          </p>
          <p className="mt-3 max-w-prose text-sm text-[var(--text-muted)]">
            Каждая проверка — это чей-то работодатель, приёмная комиссия или судья, которые
            сканировали QR-код с вашего бланка. Считаем только число: кто и откуда проверял,
            мы не собираем.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg">Что произошло с документами</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile value={data.issued} label="Выпущено" />
          <Tile value={data.mail.sent} label="Отправлено письмом" />
          <Tile value={data.mail.delivered} label="Доставлено" />
          <Tile value={data.mail.opened} label="Прочитано" />
          <Tile value={data.downloads.total} label="Скачано из кабинета" />
          <Tile value={data.mail.bounced} label="Не доставлено" tone="bad" />
          <Tile value={data.replaced} label="Заменено перевыпуском" tone="warn" />
          <Tile value={data.revoked} label="Отозвано" tone="bad" />
        </div>
        <p className="mt-3 max-w-prose text-xs text-[var(--text-muted)]">
          Отправленное, доставленное и прочитанное считаются нарастающим итогом: прочитанное
          письмо входит и в доставленные, и в отправленные.
        </p>
      </section>

      {data.documents.length > 0 && <ByDocument documents={data.documents} />}
    </div>
  );
}

function ByDocument({ documents }: { documents: RegistryAnalytics['documents'] }) {
  const most = Math.max(...documents.map((d) => d.issued), 1);

  return (
    <section>
      <h2 className="mb-3 font-serif text-lg">По материалам</h2>
      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.documentId ?? 'none'}
            className="rounded-xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
          >
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-medium">{doc.title}</span>
              {doc.eventName && (
                <span className="text-xs text-[var(--text-muted)]">{doc.eventName}</span>
              )}
              <span className="ml-auto text-sm tabular-nums">
                {doc.issued.toLocaleString('ru-RU')} выдано · {doc.verifications.toLocaleString('ru-RU')}{' '}
                {plural(doc.verifications, 'проверка', 'проверки', 'проверок')}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.round((doc.issued / most) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Tile({
  value,
  label,
  tone = 'plain',
}: {
  value: number;
  label: string;
  tone?: 'plain' | 'warn' | 'bad';
}) {
  const colors: Record<string, string> = {
    plain: 'text-[var(--text)]',
    warn: 'text-[var(--award)]',
    bad: 'text-[var(--danger)]',
  };
  return (
    <div className="rounded-xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
      <p className={`text-2xl tabular-nums ${colors[tone]}`}>{value.toLocaleString('ru-RU')}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
