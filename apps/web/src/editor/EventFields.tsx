import { useEffect, useState } from 'react';
import { CalendarDays, Check } from 'lucide-react';
import type { DocumentDetail } from '../api/types';
import { Input, Label } from '../ui/Field';

export interface EventValues {
  eventName: string;
  eventDate: string;
  eventPlace: string;
  eventHours: string;
}

const FIELDS: Array<{
  key: keyof EventValues;
  label: string;
  placeholder: string;
  variable: string;
}> = [
  {
    key: 'eventName',
    label: 'Название мероприятия',
    placeholder: 'Первенство области по плаванию',
    variable: '%event',
  },
  {
    key: 'eventDate',
    label: 'Даты',
    placeholder: '17–19 июня 2026 года',
    variable: '%event_date',
  },
  {
    key: 'eventPlace',
    label: 'Место проведения',
    placeholder: 'г. Челябинск',
    variable: '%event_place',
  },
  {
    key: 'eventHours',
    label: 'Объём часов',
    placeholder: '72 часа',
    variable: '%hours',
  },
];

/**
 * Сведения о мероприятии — одни на весь материал.
 *
 * Не колонка в таблице получателей: у соревнования одно название и одни
 * даты на всех трёхсот участников, и держать их в трёхстах одинаковых
 * ячейках — значит триста раз дать возможность опечататься. Заодно
 * исправить название после выпуска можно в одном месте, а не в трёхстах.
 *
 * Живёт на месте свойств блока, когда ничего не выделено: панель там
 * всё равно пустует, а человек, только что вставивший %event, ищет,
 * куда вписать название, именно рядом с листом.
 */
export function EventFields({
  doc,
  onSave,
}: {
  doc: DocumentDetail;
  onSave: (values: Partial<EventValues>) => void;
}) {
  const [values, setValues] = useState<EventValues>(pick(doc));
  const [saved, setSaved] = useState(false);

  // Документ перечитывается после сохранения макета и загрузки фона.
  // Сбрасываем поля на серверные только когда сменился сам материал:
  // иначе ответ, пришедший во время набора, стёр бы недописанное слово.
  useEffect(() => setValues(pick(doc)), [doc.id]);

  function commit(key: keyof EventValues) {
    if (values[key] === doc[key]) return;
    onSave({ [key]: values[key] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-medium">
          <CalendarDays size={16} className="text-[var(--text-muted)]" />
          О мероприятии
        </h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Заполните один раз — подставится во все документы этого материала. Чтобы напечатать
          на бланке, вставьте нужную переменную через «Вставить».
        </p>
      </div>

      {FIELDS.map((f) => (
        <div key={f.key}>
          <Label>{f.label}</Label>
          <Input
            value={values[f.key]}
            placeholder={f.placeholder}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            onBlur={() => commit(f.key)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <code className="mt-1 block font-mono text-xs text-[var(--text-muted)]">
            {f.variable}
          </code>
        </div>
      ))}

      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
          <Check size={14} /> Сохранено
        </p>
      )}
    </div>
  );
}

function pick(doc: DocumentDetail): EventValues {
  return {
    eventName: doc.eventName ?? '',
    eventDate: doc.eventDate ?? '',
    eventPlace: doc.eventPlace ?? '',
    eventHours: doc.eventHours ?? '',
  };
}
