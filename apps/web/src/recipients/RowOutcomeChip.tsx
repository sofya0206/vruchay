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
import { StatusChip } from '../ui/Field';
import { Tooltip } from '../ui/Tooltip';
import { OUTCOME_VIEW, outcomeHint, rowOutcome, type RowOutcome } from './row-outcome';

const ICONS: Record<Exclude<RowOutcome, 'skipped'>, ReactNode> = {
  pending: <Clock size={13} />,
  issued: <FileCheck size={13} />,
  queued: <Hourglass size={13} />,
  sent: <Send size={13} />,
  delivered: <CheckCheck size={13} />,
  opened: <MailOpen size={13} />,
  failed: <MailX size={13} />,
  changed: <PencilLine size={13} />,
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
        <span role="img" className="text-[var(--text-muted)]" aria-label={hint}>
          <Minus size={13} />
        </span>
      </Tooltip>
    );
  }

  const view = OUTCOME_VIEW[outcome];
  return (
    <Tooltip label={hint}>
      <StatusChip tone={view.tone}>
        {ICONS[outcome]}
        {view.label}
      </StatusChip>
    </Tooltip>
  );
}
