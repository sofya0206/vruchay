import { useEffect, useState } from 'react';
import type { DocumentDetail } from '../api/types';
import { Badge } from '../ui/Badge';
import { DateField } from '../ui/DateField';
import { Field, Input, Label } from '../ui/Field';

export interface EventValues {
  eventName: string;
  eventDate: string;
  eventPlace: string;
  eventHours: string;
  /** Дата выдачи днём (ГГГГ-ММ-ДД); пусто — в день выпуска. */
  issueDate: string;
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
    placeholder: 'Конкурс «Мастер года»',
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
 * Не колонка в таблице получателей: у мероприятия одно название и одни
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
  onDraft,
}: {
  doc: DocumentDetail;
  /** Дата выдачи уходит null, когда поле очищено: «в день выпуска». */
  onSave: (values: Partial<Record<keyof EventValues, string | null>>) => void;
  /**
   * Набранное прямо сейчас, ещё не сохранённое. Нужно холсту: он рисует
   * подставленные значения, и без этого название появлялось бы на листе
   * только после ухода с поля — то есть выглядело бы неработающим.
   */
  onDraft?: (values: EventValues) => void;
}) {
  const [values, setValues] = useState<EventValues>(pick(doc));
  const [saved, setSaved] = useState(false);

  // Документ перечитывается после сохранения макета и загрузки фона.
  // Сбрасываем поля на серверные только когда сменился сам материал:
  // иначе ответ, пришедший во время набора, стёр бы недописанное слово.
  useEffect(() => setValues(pick(doc)), [doc.id]);

  function edit(key: keyof EventValues, value: string) {
    const next = { ...values, [key]: value };
    setValues(next);
    onDraft?.(next);
  }

  function commit(key: keyof EventValues) {
    if (values[key] === (doc[key] ?? '')) return;
    onSave({ [key]: key === 'issueDate' ? values[key] || null : values[key] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Заголовок не нужен: его роль играет вкладка «Мероприятие» над панелью. */}
      <p className="text-sm text-muted">Заполните один раз — подставится во все документы материала.</p>

      {FIELDS.map((f) => (
        <Field key={f.key} label={f.label} help={<code className="font-mono text-xs">{f.variable}</code>}>
          <Input
            value={values[f.key]}
            placeholder={f.placeholder}
            onChange={(e) => edit(f.key, e.target.value)}
            onBlur={() => commit(f.key)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </Field>
      ))}

      {/* Дата выдачи — отдельно от дат мероприятия: это одно число для
          «выдан 17.06.2026», а не «17–19 июня». Пусто — день выпуска:
          грамоты за прошедшее мероприятие печатают позже награждения. */}
      <div>
        <Label>Дата выдачи</Label>
        <DateField
          value={values.issueDate}
          onChange={(date) => edit('issueDate', date)}
          // Раньше сохранение висело на уходе из поля. С календарём уход
          // наступает в миг его открытия, поэтому момент «человек закончил»
          // приходит явно — при закрытии.
          onCommit={() => commit('issueDate')}
          aria-label="Дата выдачи"
          placeholder="День выпуска"
        />
        <p className="mt-1.5 text-xs text-muted">
          Пусто — день выпуска. Поля: <code className="font-mono">%date</code>,{' '}
          <code className="font-mono">%date_long</code>, <code className="font-mono">%year</code>
        </p>
      </div>

      {saved && (
        <Badge tone="ok" dot>
          Сохранено
        </Badge>
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
    issueDate: doc.issueDate ? doc.issueDate.slice(0, 10) : '',
  };
}
