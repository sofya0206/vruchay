import { useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { DateField } from '../ui/DateField';
import { Input, Label } from '../ui/Field';
import { Select, type SelectOption } from '../ui/Select';
import { humanIso } from '../ui/calendar';
import { cn } from '../ui/cn';
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

const STATE_OPTIONS: SelectOption<Filters['state']>[] = [
  { value: 'valid', label: 'Действителен' },
  { value: 'replaced', label: 'Заменён' },
  { value: 'expired', label: 'Срок истёк' },
  { value: 'revoked', label: 'Отозван' },
];

const MAIL_OPTIONS: SelectOption[] = [
  { value: 'none', label: 'Не отправлялось' },
  { value: 'sent', label: 'Отправлено' },
  { value: 'delivered', label: 'Доставлено' },
  { value: 'opened', label: 'Прочитано' },
  { value: 'bounced', label: 'Не доставлено' },
  { value: 'failed', label: 'Ошибка отправки' },
];

/** Пустой пункт списка: на широком экране подписей над полями нет, и он сам называет поле. */
function withAny<T extends string>(any: string, options: SelectOption<T>[]): SelectOption<T | ''>[] {
  return [{ value: '', label: any }, ...options];
}

interface Chip {
  key: keyof Filters;
  label: string;
}

/** Что сейчас стоит в отборе — чипами, каждый снимается по отдельности. */
export function activeChips(value: Filters, facets: RegistryFacets | undefined): Chip[] {
  const chips: Chip[] = [];
  if (value.documentId) {
    const doc = documentOptions(facets, value.documentId).find((d) => d.id === value.documentId);
    chips.push({ key: 'documentId', label: doc?.label ?? 'Материал' });
  }
  if (value.event) chips.push({ key: 'event', label: value.event });
  if (value.state) {
    const state = STATE_OPTIONS.find((o) => o.value === value.state);
    chips.push({ key: 'state', label: state?.label ?? value.state });
  }
  if (value.mail) {
    const mail = MAIL_OPTIONS.find((o) => o.value === value.mail);
    chips.push({ key: 'mail', label: `Письмо: ${(mail?.label ?? value.mail).toLowerCase()}` });
  }
  if (value.from) chips.push({ key: 'from', label: `с ${humanIso(value.from) ?? value.from}` });
  if (value.to) chips.push({ key: 'to', label: `по ${humanIso(value.to) ?? value.to}` });
  return chips;
}

/**
 * Отбор в реестре.
 *
 * Поиск — первым и самым широким, остальное рядом и мелко: так и ищут,
 * человек помнит фамилию, а не мероприятие, и уж точно не помнит,
 * в каком материале выпускалась грамота. Что стоит в отборе, видно
 * по чипам под строкой — каждый снимается своим крестиком.
 */
export function RegistryFilters({ value, facets, onChange, onReset }: Props) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const set = <K extends keyof Filters>(key: K, next: Filters[K]) =>
    onChange({ ...value, [key]: next });

  const chips = activeChips(value, facets);
  const compact = !phone;

  const material = (
    <Select
      compact={compact}
      value={value.documentId}
      onChange={(id) => set('documentId', id)}
      aria-label="Материал"
      className={cn(compact && 'w-52')}
      options={withAny(
        'Все материалы',
        documentOptions(facets, value.documentId).map((doc) => ({ value: doc.id, label: doc.label })),
      )}
    />
  );
  const event = (
    <Select
      compact={compact}
      value={value.event}
      onChange={(next) => set('event', next)}
      aria-label="Мероприятие"
      className={cn(compact && 'w-48')}
      options={withAny(
        'Все мероприятия',
        (facets?.events ?? []).map((name) => ({ value: name, label: name })),
      )}
    />
  );
  const state = (
    <Select
      compact={compact}
      value={value.state}
      onChange={(next) => set('state', next)}
      aria-label="Состояние"
      className={cn(compact && 'w-44')}
      options={withAny('Любое состояние', STATE_OPTIONS)}
    />
  );
  const mail = (
    <Select
      compact={compact}
      value={value.mail}
      onChange={(next) => set('mail', next)}
      aria-label="Письмо"
      className={cn(compact && 'w-44')}
      options={withAny('Письмо: любое', MAIL_OPTIONS)}
    />
  );
  /* У поля даты нет `compact` — ужимаем классами до роста остальных контролов строки. */
  const dateClass = compact ? 'h-8 w-40 py-0 text-sm' : undefined;
  const from = (
    <DateField
      value={value.from}
      onChange={(next) => set('from', next)}
      max={value.to || undefined}
      aria-label="Выдан с"
      placeholder="Выдан с"
      className={dateClass}
    />
  );
  const to = (
    <DateField
      value={value.to}
      onChange={(next) => set('to', next)}
      min={value.from || undefined}
      aria-label="Выдан по"
      placeholder="по"
      className={dateClass}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-72">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
          />
          <Input
            compact={compact}
            data-tour="registry-search"
            className="pl-8"
            placeholder="Фамилия, почта или код"
            value={value.search}
            onChange={(e) => set('search', e.target.value)}
            aria-label="Поиск по реестру"
          />
        </div>

        {/* На телефоне остальные поля — нижним листом: шесть полей столбиком
            выталкивали документы за экран. */}
        {phone ? (
          <Button
            icon={<SlidersHorizontal size={16} />}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
          >
            Фильтры
            {chips.length > 0 && (
              <Badge tone="accent" size="sm">
                {chips.length}
              </Badge>
            )}
          </Button>
        ) : (
          <>
            {material}
            {event}
            {state}
            {mail}
            {from}
            {to}
          </>
        )}
      </div>

      {phone && (
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          title="Фильтры"
          footer={
            <>
              <Button variant="ghost" onClick={onReset} disabled={chips.length === 0}>
                Сбросить
              </Button>
              <Button variant="primary" className="ml-auto" onClick={() => setOpen(false)}>
                Готово
              </Button>
            </>
          }
        >
          {/* Обёртка не label: подпись к кнопке-списку привязана через aria-label,
              а <Label> рисует её глазу. */}
          <div className="grid gap-3 px-3 pb-2">
            <Labeled label="Материал">{material}</Labeled>
            <Labeled label="Мероприятие">{event}</Labeled>
            <Labeled label="Состояние">{state}</Labeled>
            <Labeled label="Письмо">{mail}</Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Выдан с">{from}</Labeled>
              <Labeled label="по">{to}</Labeled>
            </div>
          </div>
        </BottomSheet>
      )}

      {(chips.length > 0 || value.search) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => set(chip.key, '')}
              aria-label={`Убрать из отбора: ${chip.label}`}
              className="pressable rounded-full"
            >
              <Badge tone="accent" className="pr-1.5">
                {chip.label}
                <X size={12} strokeWidth={3} aria-hidden />
              </Badge>
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={onReset}>
            Сбросить отбор
          </Button>
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
