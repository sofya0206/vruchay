import { FileBadge, Megaphone } from 'lucide-react';
import { OptionCard, OptionGroup } from '../ui/OptionCard';
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
  const options: { id: LetterKind; title: string; hint: string; icon: typeof FileBadge }[] = [
    textOnly
      ? {
          id: 'transactional',
          title: 'Служебное',
          hint: 'Перенос, напоминание, ссылка на результаты. Согласие не требуется.',
          icon: FileBadge,
        }
      : {
          id: 'transactional',
          title: 'Выдача документа',
          hint: 'Грамота, ссылка на неё, уведомление о сроке. Согласие не требуется.',
          icon: FileBadge,
        },
    {
      id: 'marketing',
      title: 'Реклама',
      hint: 'Приглашения и предложения. Только тем, кто дал согласие, — с отпиской.',
      icon: Megaphone,
    },
  ];

  return (
    <OptionGroup label="Поток письма" columns={2}>
      {options.map((option) => (
        <OptionCard
          key={option.id}
          icon={option.icon}
          title={option.title}
          description={option.hint}
          selected={kind === option.id}
          disabled={disabled && kind !== option.id}
          onSelect={() => onChange(option.id)}
        />
      ))}
    </OptionGroup>
  );
}
