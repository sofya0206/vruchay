import { Search, X } from 'lucide-react';
import { Input, Label, Select } from '../ui/Field';
import { Button } from '../ui/Button';
import type { RegistryFacets, RegistryFilters as Filters } from '../api/registry';

interface Props {
  value: Filters;
  facets: RegistryFacets | undefined;
  onChange: (next: Filters) => void;
  onReset: () => void;
}

/**
 * Отбор в реестре.
 *
 * Поиск отдельной широкой строкой, остальное — рядом и мелко. Так и ищут:
 * человек помнит фамилию, а не мероприятие, и уж точно не помнит,
 * в каком материале выпускалась грамота.
 */
export function RegistryFilters({ value, facets, onChange, onReset }: Props) {
  const set = <K extends keyof Filters>(key: K, next: Filters[K]) =>
    onChange({ ...value, [key]: next });

  const active =
    value.documentId || value.event || value.state || value.mail || value.from || value.to;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <Input
          className="pl-9"
          placeholder="Фамилия, адрес почты или проверочный код"
          value={value.search}
          onChange={(e) => set('search', e.target.value)}
          aria-label="Поиск по реестру"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="block">
          <Label>Материал</Label>
          <Select value={value.documentId} onChange={(e) => set('documentId', e.target.value)}>
            <option value="">Любой</option>
            {facets?.documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title}
                {doc.deletedAt ? ' (в корзине)' : ''}
              </option>
            ))}
          </Select>
        </label>

        <label className="block">
          <Label>Мероприятие</Label>
          <Select value={value.event} onChange={(e) => set('event', e.target.value)}>
            <option value="">Любое</option>
            {facets?.events.map((event) => (
              <option key={event} value={event}>
                {event}
              </option>
            ))}
          </Select>
        </label>

        <label className="block">
          <Label>Состояние</Label>
          <Select
            value={value.state}
            onChange={(e) => set('state', e.target.value as Filters['state'])}
          >
            <option value="">Любое</option>
            <option value="valid">Действителен</option>
            <option value="replaced">Заменён</option>
            <option value="revoked">Отозван</option>
          </Select>
        </label>

        <label className="block">
          <Label>Письмо</Label>
          <Select value={value.mail} onChange={(e) => set('mail', e.target.value)}>
            <option value="">Любое</option>
            <option value="none">Не отправлялось</option>
            <option value="sent">Отправлено</option>
            <option value="delivered">Доставлено</option>
            <option value="opened">Прочитано</option>
            <option value="bounced">Не доставлено</option>
            <option value="failed">Ошибка отправки</option>
          </Select>
        </label>

        <label className="block">
          <Label>Выдан с</Label>
          <Input type="date" value={value.from} onChange={(e) => set('from', e.target.value)} />
        </label>

        <label className="block">
          <Label>по</Label>
          <Input type="date" value={value.to} onChange={(e) => set('to', e.target.value)} />
        </label>
      </div>

      {(active || value.search) && (
        <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={onReset}>
          Сбросить отбор
        </Button>
      )}
    </div>
  );
}
