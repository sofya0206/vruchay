import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input, Label } from '../ui/Field';
import { DateField } from '../ui/DateField';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { BottomSheet } from '../ui/BottomSheet';
import { usePhone } from '../ui/useMediaQuery';
import type { RegistryFacets, RegistryFilters as Filters } from '../api/registry';

interface Props {
  value: Filters;
  facets: RegistryFacets | undefined;
  onChange: (next: Filters) => void;
  onReset: () => void;
}

/** Что показать в списке материалов, включая названный в адресе. */
export interface DocumentOption {
  id: string;
  label: string;
}

/**
 * Материалы для отбора.
 *
 * Сервер перечисляет только те, по которым что-то выдано, — в списке
 * незачем сорок пустых заготовок. Но по ссылке «выданное по этому
 * материалу» можно прийти и с материалом, по которому пока ничего нет:
 * тогда отбор стоит, а список о материале не знает, и поле показывало бы
 * «Любой». Человек видел «ничего не найдено» при якобы пустом отборе
 * и понимал это как «у меня вообще ничего не выдано».
 *
 * Поэтому названный в адресе материал добавляем сами. Названия у нас
 * нет — сервер его не прислал, — и подписываем нейтрально: важно, что
 * отбор виден и его есть чем снять.
 */
export function documentOptions(
  facets: RegistryFacets | undefined,
  documentId: string,
): DocumentOption[] {
  const known = (facets?.documents ?? []).map((doc) => ({
    id: doc.id,
    label: doc.title + (doc.deletedAt ? ' (в корзине)' : ''),
  }));

  if (!documentId || known.some((doc) => doc.id === documentId)) return known;
  return [...known, { id: documentId, label: 'Выбранный материал' }];
}

/**
 * Отбор в реестре.
 *
 * Поиск отдельной широкой строкой, остальное — рядом и мелко. Так и ищут:
 * человек помнит фамилию, а не мероприятие, и уж точно не помнит,
 * в каком материале выпускалась грамота.
 */
export function RegistryFilters({ value, facets, onChange, onReset }: Props) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const set = <K extends keyof Filters>(key: K, next: Filters[K]) =>
    onChange({ ...value, [key]: next });

  const active =
    value.documentId || value.event || value.state || value.mail || value.from || value.to;

  const activeCount = [value.documentId, value.event, value.state, value.mail, value.from || value.to].filter(Boolean).length;

  const grid = (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Обёртка перестала быть label: подпись к кнопке-списку
            привязывается через aria-label, а <Label> рисует её глазу. */}
        <div className="block">
          <Label>Материал</Label>
          <Select
            value={value.documentId}
            onChange={(id) => set('documentId', id)}
            aria-label="Материал"
            options={[
              { value: '', label: 'Любой' },
              ...documentOptions(facets, value.documentId).map((doc) => ({
                value: doc.id,
                label: doc.label,
              })),
            ]}
          />
        </div>

        <div className="block">
          <Label>Мероприятие</Label>
          <Select
            value={value.event}
            onChange={(event) => set('event', event)}
            aria-label="Мероприятие"
            options={[
              { value: '', label: 'Любое' },
              ...(facets?.events ?? []).map((event) => ({ value: event, label: event })),
            ]}
          />
        </div>

        <div className="block">
          <Label>Состояние</Label>
          <Select
            value={value.state}
            onChange={(state) => set('state', state)}
            aria-label="Состояние"
            options={[
              { value: '' as Filters['state'], label: 'Любое' },
              { value: 'valid' as Filters['state'], label: 'Действителен' },
              { value: 'replaced' as Filters['state'], label: 'Заменён' },
              { value: 'expired' as Filters['state'], label: 'Срок истёк' },
              { value: 'revoked' as Filters['state'], label: 'Отозван' },
            ]}
          />
        </div>

        <div className="block">
          <Label>Письмо</Label>
          <Select
            value={value.mail}
            onChange={(mail) => set('mail', mail)}
            aria-label="Письмо"
            options={[
              { value: '', label: 'Любое' },
              { value: 'none', label: 'Не отправлялось' },
              { value: 'sent', label: 'Отправлено' },
              { value: 'delivered', label: 'Доставлено' },
              { value: 'opened', label: 'Прочитано' },
              { value: 'bounced', label: 'Не доставлено' },
              { value: 'failed', label: 'Ошибка отправки' },
            ]}
          />
        </div>

        <div className="block">
          <Label>Выдан с</Label>
          <DateField
            value={value.from}
            onChange={(from) => set('from', from)}
            max={value.to || undefined}
            aria-label="Выдан с"
            placeholder="Любая дата"
          />
        </div>

        <div className="block">
          <Label>по</Label>
          <DateField
            value={value.to}
            onChange={(to) => set('to', to)}
            min={value.from || undefined}
            aria-label="Выдан по"
            placeholder="Любая дата"
          />
        </div>
      </div>
  );

  return (
    <div className="space-y-3">
      {/* На телефоне поиск и кнопка «Фильтры» в одну строку, сами отборы —
          нижним листом: шесть полей столбиком выталкивали документы за экран. */}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <Input
            className="pl-9 max-md:h-11"
            placeholder="Фамилия, почта или код"
            value={value.search}
            onChange={(e) => set('search', e.target.value)}
            aria-label="Поиск по реестру"
          />
        </div>
        {phone && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-medium"
          >
            <SlidersHorizontal size={16} />
            Фильтры
            {activeCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[11px] font-semibold text-white">{activeCount}</span>
            )}
          </button>
        )}
      </div>

      {phone ? (
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Фильтры">
          <div className="px-3 pb-2">{grid}</div>
        </BottomSheet>
      ) : (
        grid
      )}

      {(active || value.search) && (
        <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={onReset}>
          Сбросить отбор
        </Button>
      )}
    </div>
  );
}
