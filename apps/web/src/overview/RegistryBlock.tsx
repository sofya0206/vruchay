import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { emptyFilters, filtersToQuery } from '../api/registry';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { Card } from '../ui/Card';

/**
 * Найти выданное — одной строкой.
 *
 * Самый частый вопрос через месяц после мероприятия — «пришлите грамоту
 * Ивановой». Фамилию вводят прямо здесь, а реестр открывается уже суженным:
 * строка уезжает в адрес тем же отбором, который реестр разбирает обратно
 * (`filtersFromQuery`). Поэтому ссылку можно отдать коллеге, а браузер
 * помнит, что искали.
 */
export function RegistryBlock() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    navigate(searchPath(query));
  }

  return (
    <Card
      title="Найти выданный документ"
      about="По фамилии, адресу почты или проверочному коду"
      to="/registry"
      linkLabel="Весь реестр"
    >
      <form onSubmit={onSubmit} className="flex max-w-2xl flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <Input
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Например, Иванова"
            aria-label="Найти в реестре выданного"
          />
        </div>
        <Button type="submit" variant="primary">
          Найти
        </Button>
      </form>
    </Card>
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
