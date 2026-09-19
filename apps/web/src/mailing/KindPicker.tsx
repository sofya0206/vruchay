import { Radio } from '../ui/Checkbox';
import type { LetterKind } from './api';

/**
 * Выбор потока.
 *
 * Первый шаг, а не настройка в глубине: от него зависит и текст письма,
 * и список получателей, и законность отправки. Объяснение рядом —
 * оператор не обязан помнить статьи, но обязан выбрать верно.
 */
export function KindPicker({
  kind,
  textOnly,
  disabled,
  onChange,
}: {
  kind: LetterKind;
  /** Рассылка без документа: выдавать нечего, поток тот же — служебная переписка. */
  textOnly?: boolean;
  /** Письма уже ушли — поток не меняется, как и текст. */
  disabled?: boolean;
  onChange: (kind: LetterKind) => void;
}) {
  const options: { id: LetterKind; title: string; hint: string }[] = [
    textOnly
      ? {
          id: 'transactional',
          title: 'Служебное',
          hint: 'Перенос, напоминание, ссылка на результаты. Согласие не требуется.',
        }
      : {
          id: 'transactional',
          title: 'Выдача документа',
          hint: 'Грамота, ссылка на неё, уведомление о сроке. Согласие не требуется.',
        },
    {
      id: 'marketing',
      title: 'Реклама',
      hint: 'Приглашения и предложения. Только тем, кто дал согласие, — с отпиской.',
    },
  ];

  return (
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      {options.map((option) => (
        <label
          key={option.id}
          className={`rounded-2xl p-4 ring-1 transition-colors ${
            disabled ? (kind === option.id ? '' : 'opacity-50') : 'cursor-pointer'
          } ${
            kind === option.id
              ? 'bg-[var(--accent-soft)] ring-[var(--accent)]'
              : `bg-[var(--surface)] ring-[var(--line)] ${disabled ? '' : 'hover:bg-[var(--surface-sunken)]'}`
          }`}
        >
          <span className="flex items-center gap-2 font-medium">
            <Radio
              name="letter-kind"
              checked={kind === option.id}
              onChange={() => onChange(option.id)}
            />
            {option.title}
          </span>
          <span className="mt-1.5 block text-sm text-[var(--text-muted)]">{option.hint}</span>
        </label>
      ))}
    </fieldset>
  );
}
