import type { ReactNode } from 'react';
import {
  CheckCheck,
  Clock,
  FileCheck,
  Hourglass,
  MailOpen,
  MailX,
  Minus,
  PencilLine,
  Send,
} from 'lucide-react';
import type { RecipientRow } from '../api/recipients';
import { Badge, type BadgeTone } from '../ui/Badge';
import type { ChipTone } from '../ui/Field';
import { ICON, STROKE } from '../ui/icon';
import { Tooltip } from '../ui/Tooltip';
import { OUTCOME_VIEW, outcomeHint, rowOutcome, type RowOutcome } from './row-outcome';

/* Тона итога описаны прежними именами метки; здесь они становятся тонами Badge. */
const TONES: Record<ChipTone, BadgeTone> = {
  neutral: 'neutral',
  progress: 'info',
  done: 'ok',
  warn: 'warn',
  error: 'danger',
};

const ICONS: Record<Exclude<RowOutcome, 'skipped'>, ReactNode> = {
  pending: <Clock size={ICON.sm} strokeWidth={STROKE} />,
  issued: <FileCheck size={ICON.sm} strokeWidth={STROKE} />,
  queued: <Hourglass size={ICON.sm} strokeWidth={STROKE} />,
  sent: <Send size={ICON.sm} strokeWidth={STROKE} />,
  delivered: <CheckCheck size={ICON.sm} strokeWidth={STROKE} />,
  opened: <MailOpen size={ICON.sm} strokeWidth={STROKE} />,
  failed: <MailX size={ICON.sm} strokeWidth={STROKE} />,
  changed: <PencilLine size={ICON.sm} strokeWidth={STROKE} />,
};

/** Итог строки плашкой: цвет и значок читаются раньше слова. */
export function RowOutcomeChip({ row }: { row: RecipientRow }) {
  const outcome = rowOutcome(row);
  const hint = outcomeHint(outcome, row.mailStatus);

  // Не отмеченная и нетронутая строка — не событие: плашка на каждой
  // такой строке зашумила бы колонку, где важны как раз отличия.
  if (outcome === 'skipped') {
    return (
      <Tooltip label={hint} describes={false}>
        <span role="img" className="text-muted" aria-label={hint}>
          <Minus size={ICON.sm} strokeWidth={STROKE} />
        </span>
      </Tooltip>
    );
  }

  const view = OUTCOME_VIEW[outcome];
  return (
    <Tooltip label={hint}>
      <Badge tone={TONES[view.tone]}>
        {ICONS[outcome]}
        {view.label}
      </Badge>
    </Tooltip>
  );
}
