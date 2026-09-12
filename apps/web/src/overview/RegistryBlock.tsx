import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { emptyFilters, filtersToQuery, useRegistry } from '../api/registry';
import { StateChip } from '../registry/StateChip';
import { plural, stateLabel, stateTone } from '../registry/registry-format';
import { Input } from '../ui/Field';
import { Block, Empty, Rows } from './Block';
import { formatWhen } from './format';

/** Сколько строк показать на главной: последние выданные или найденные. */
const SHOWN = 6;

/** Пауза после последней буквы, прежде чем спрашивать сервер. */
const DEBOUNCE_MS = 250;

/**
 * Четвёртый блок полосы: найти выданное, не уходя с главной.
 *
 * Самый частый вопрос через месяц после мероприятия — «пришлите грамоту
 * Ивановой». Раньше ответ начинался с плитки «Реестр», за которой лежали
 * все восемь тысяч выданных документов и отбор, который ещё надо собрать.
 *
 * Теперь поиск живой: с первой буквы под строкой стоят совпадения, и
 * чаще всего этого хватает. В сам реестр — только когда нужны действия
 * над найденным: переотправить, отозвать, скачать. Строка уезжает в
 * адрес тем же отбором, который реестр разбирает обратно
 * (`filtersFromQuery`), поэтому ссылку можно отдать коллеге.
 */
export function RegistryBlock() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const registry = useRegistry({ ...emptyFilters, search }, 0, SHOWN);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    navigate(searchPath(query));
  }

  const rows = registry.data?.items ?? [];
  const total = registry.data?.total ?? 0;
  const searching = search !== '';
  // Ответ на прежний запрос стоит, пока считается новый: подпись об этом
  // предупреждает, чтобы совпадения по «Ива» не приняли за «Иван».
  const stale = registry.isFetching && registry.data !== undefined;

  return (
    <Block
      title="Реестр"
      about="Всё, что вы когда-либо выдали. Начните вводить фамилию, адрес почты или проверочный код — совпадения появятся сразу."
      to="/registry"
      linkLabel="Весь реестр"
    >
      <form onSubmit={onSubmit} className="mb-4 max-w-2xl">
        <div className="relative">
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
            autoComplete="off"
          />
        </div>
      </form>

      {registry.isPending ? (
        <p className="text-sm text-[var(--text-muted)]">Загружаем последние выданные…</p>
      ) : rows.length === 0 ? (
        <Empty>
          {searching
            ? 'Ничего не нашлось. Проверьте написание или попробуйте адрес почты.'
            : 'Выданных документов пока нет. Они появятся здесь сразу после первого выпуска — и останутся навсегда.'}
        </Empty>
      ) : (
        <>
          <p
            className={`mb-2 text-sm text-[var(--text-muted)] transition-opacity ${stale ? 'opacity-50' : ''}`}
            aria-live="polite"
          >
            {searching
              ? `Найдено ${total.toLocaleString('ru-RU')} ${plural(total, 'документ', 'документа', 'документов')}`
              : 'Последние выданные'}
          </p>
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
                      {row.email && `${row.email} · `}
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
          {total > rows.length && (
            <Link
              to={searchPath(query)}
              className="mt-3 inline-block text-sm text-[var(--accent)] underline-offset-4 hover:underline"
            >
              Показать все {total.toLocaleString('ru-RU')} в реестре
            </Link>
          )}
        </>
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
