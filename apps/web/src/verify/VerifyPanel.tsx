import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import type { DocumentDetail } from '../api/types';
import { Button } from '../ui/Button';
import { Radio } from '../ui/Checkbox';
import { Input, Label, Select } from '../ui/Field';

/**
 * Готовые сроки: то, что просят чаще всего. Своя длительность — рядом
 * полем в записи ISO 8601, чтобы не заводить конструктор ради «P18M».
 */
const PRESETS: { value: string; label: string }[] = [
  { value: 'P6M', label: 'Полгода' },
  { value: 'P1Y', label: 'Год' },
  { value: 'P2Y', label: 'Два года' },
  { value: 'P3Y', label: 'Три года' },
  { value: 'P5Y', label: 'Пять лет' },
  { value: 'custom', label: 'Другой срок…' },
];

type Mode = 'none' | 'duration' | 'date';

function modeOf(doc: Pick<DocumentDetail, 'expiresIn' | 'expiresAt'>): Mode {
  if (doc.expiresAt) return 'date';
  if (doc.expiresIn) return 'duration';
  return 'none';
}

/** Дата для поля ввода: ГГГГ-ММ-ДД по Москве. */
function dateInputValue(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Подлинность выданного: срок действия и страница проверки.
 *
 * Срок — правило материала, применяется в момент выпуска и записывается
 * в каждый документ. Менять его можно, уже выданные документы от этого
 * не меняются: их срок напечатан на бумаге и на странице проверки.
 */
export function VerifyPanel({ doc }: { doc: DocumentDetail }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(modeOf(doc));
  const [preset, setPreset] = useState('P1Y');
  const [custom, setCustom] = useState('');
  const [date, setDate] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMode(modeOf(doc));
    const known = PRESETS.some((p) => p.value === doc.expiresIn);
    setPreset(doc.expiresIn ? (known ? doc.expiresIn : 'custom') : 'P1Y');
    setCustom(doc.expiresIn && !known ? doc.expiresIn : '');
    setDate(dateInputValue(doc.expiresAt));
  }, [doc]);

  const save = useMutation({
    mutationFn: (body: { expiresIn: string | null; expiresAt: string | null }) =>
      api.patch<DocumentDetail>(`/documents/${doc.id}`, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['document', doc.id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    },
  });

  function submit() {
    if (mode === 'none') {
      save.mutate({ expiresIn: null, expiresAt: null });
      return;
    }
    if (mode === 'duration') {
      const value = preset === 'custom' ? custom.trim().toUpperCase() : preset;
      save.mutate({ expiresIn: value, expiresAt: null });
      return;
    }
    // Конец дня по Москве: «до 31 декабря» значит включая всё 31-е.
    save.mutate({ expiresIn: null, expiresAt: `${date}T23:59:59+03:00` });
  }

  const canSave =
    mode === 'none' ||
    (mode === 'duration' && (preset !== 'custom' || /^P\d+[YMWD]/i.test(custom.trim()))) ||
    (mode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(date));

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-6">
      <section>
        <h2 className="flex items-center gap-2 font-serif text-xl">
          <CalendarClock size={18} className="text-[var(--accent)]" />
          Срок действия
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
          Считается в момент выпуска и печатается переменной{' '}
          <span className="font-mono">%valid_until</span>. Уже выданные документы правка не
          затрагивает: их срок остаётся тем, что на бумаге. За месяц до окончания участнику уходит
          письмо.
        </p>

        <div className="mt-4 max-w-md space-y-3 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
          {(
            [
              ['none', 'Бессрочный', 'грамоты, дипломы, благодарности'],
              ['duration', 'Срок от даты выдачи', 'сертификаты о квалификации, допуски'],
              ['date', 'До фиксированной даты', 'сезонные допуски, членство'],
            ] as const
          ).map(([value, label, hint]) => (
            <Radio
              key={value}
              name="expiry-mode"
              checked={mode === value}
              onChange={() => setMode(value)}
              label={label}
              hint={hint}
            />
          ))}

          {mode === 'duration' && (
            <div className="space-y-2 pl-6">
              <Label>Срок</Label>
              <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
                {PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
              {preset === 'custom' && (
                <>
                  <Input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="P18M"
                    maxLength={20}
                  />
                  <p className="text-xs text-[var(--text-muted)]">
                    Запись ISO 8601: P18M — полтора года, P2W — две недели, P30D — тридцать дней.
                  </p>
                </>
              )}
            </div>
          )}

          {mode === 'date' && (
            <div className="space-y-2 pl-6">
              <Label>Действителен до</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <Button
              size="sm"
              variant="primary"
              disabled={!canSave || save.isPending}
              onClick={submit}
            >
              {save.isPending ? 'Сохраняем…' : 'Сохранить'}
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
                <Check size={15} /> Сохранено
              </span>
            )}
          </div>
          {save.isError && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {(save.error as Error).message}
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="flex items-center gap-2 font-serif text-xl">
          <ShieldCheck size={18} className="text-[var(--accent)]" />
          Страница проверки
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
          {doc.verifyEnabled
            ? 'Проверка по QR включена. Какие поля показывать проверяющему — в редакторе макета, раздел «Проверка по QR».'
            : 'Проверка по QR выключена: страница проверки отвечает «не найдено». Включается в редакторе макета, раздел «Проверка по QR».'}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Как показывать ФИО — полностью, инициалами или не показывать — задаётся один раз на всю
          организацию в настройках.
        </p>
      </section>
    </div>
  );
}
