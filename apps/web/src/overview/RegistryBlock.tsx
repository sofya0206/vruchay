import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { emptyFilters, filtersToQuery, useRegistry } from '../api/registry';
import { StateChip } from '../registry/StateChip';
import { stateLabel, stateTone } from '../registry/registry-format';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { Block, Empty, Rows } from './Block';
import { formatWhen } from './format';

/** Сколько последних выданных показать. Дальше — в самом реестре. */
const LAST_SHOWN = 5;

/**
 * Четвёртый блок полосы: найти выданное.
 *
 * Самый частый вопрос через месяц после мероприятия — «пришлите грамоту
 * Ивановой». Раньше ответ начинался с плитки «Реестр», за которой лежали
 * все восемь тысяч выданных документов и отбор, который ещё надо собрать.
 *
 * Теперь фамилию вводят прямо здесь, а реестр открывается уже суженным:
 * строка уезжает в адрес тем же отбором, который реестр разбирает обратно
 * (`filtersFromQuery`). Поэтому ссылку можно отдать коллеге, а браузер
 * помнит, что искали.
 */
export function RegistryBlock() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const registry = useRegistry(emptyFilters, 0, LAST_SHOWN);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    navigate(searchPath(query));
  }

  const rows = registry.data?.items ?? [];

  return (
    <Block
      title="Реестр"
      about="Всё, что вы когда-либо выдали. Найдите по фамилии, адресу почты или проверочному коду."
      to="/registry"
      linkLabel="Весь реестр"
    >
      <form onSubmit={onSubmit} className="mb-4 flex max-w-2xl flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <Input
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Фамилия, адрес почты или проверочный код"
            aria-label="Найти в реестре выданного"
          />
        </div>
        <Button type="submit" variant="primary">
          Найти
        </Button>
      </form>

      {registry.isPending ? (
        <p className="text-sm text-[var(--text-muted)]">Загружаем последние выданные…</p>
      ) : rows.length === 0 ? (
        <Empty>
          Выданных документов пока нет. Они появятся здесь сразу после первого
          выпуска — и останутся навсегда.
        </Empty>
      ) : (
        <Rows>
          {rows.map((row) => (
            <li key={row.fileId}>
              {/*
               * Ведём поиском по имени, а не по коду: в реестре откроется
               * ровно то, что человек и хотел бы набрать сам, и строку
               * поиска там видно — её есть чем снять.
               */}
              <Link
                to={searchPath(row.name)}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-[var(--accent-soft)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.name}</span>
                  <span className="mt-0.5 block truncate text-sm text-[var(--text-muted)]">
                    {row.documentTitle}
                    {row.eventName && ` · ${row.eventName}`}
                  </span>
                </span>
                <StateChip tone={stateTone(row)}>{stateLabel(row)}</StateChip>
                <span className="shrink-0 text-sm text-[var(--text-muted)]">
                  {formatWhen(row.issuedAt)}
                </span>
              </Link>
            </li>
          ))}
        </Rows>
      )}
    </Block>
  );
}

/**
 * Адрес реестра с наложенным отбором.
 *
 * Собираем тем же кодом, что разбирает реестр, а не склейкой строки:
 * пустой запрос не должен превращаться в `?search=`, иначе реестр
 * откроется с отбором по пустой строке.
 */
export function searchPath(query: string): string {
  const search = filtersToQuery({ ...emptyFilters, search: query.trim() });
  return search ? `/registry?${search}` : '/registry';
}
