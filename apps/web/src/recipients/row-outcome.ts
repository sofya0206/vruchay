import type { RecipientRow } from '../api/recipients';
import type { ChipTone } from '../ui/Field';

/**
 * Итог строки — одно состояние вместо трёх полей.
 *
 * Галочка, выпущенный файл и письмо лежат отдельно, и сводить их
 * приходилось в уме: галочку видно в таблице, письмо — в реестре, файл —
 * нигде. Итог берёт самый дальний шаг, до которого строка дошла, поэтому
 * снятая галочка у уже доставленного документа не прячет доставку:
 * галочка говорит о следующем выпуске, итог — о том, что уже случилось.
 */
export type RowOutcome =
  | 'skipped'
  | 'pending'
  | 'issued'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'failed'
  | 'changed';

export function rowOutcome(
  row: Pick<RecipientRow, 'checked' | 'lastFileId' | 'mailStatus' | 'changedSinceIssue'>,
): RowOutcome {
  // Выше доставки: человеку ушёл документ со старыми данными, и исправит
  // это только перевыпуск — он же заново отправит письмо, если адрес
  // поправили после отказа.
  if (row.changedSinceIssue) return 'changed';
  switch (row.mailStatus) {
    case 'bounced':
    case 'failed':
      return 'failed';
    case 'opened':
      return 'opened';
    case 'delivered':
      return 'delivered';
    case 'sent':
      return 'sent';
    case 'queued':
      return 'queued';
  }
  if (row.lastFileId) return 'issued';
  return row.checked ? 'pending' : 'skipped';
}

export const OUTCOME_VIEW: Record<
  Exclude<RowOutcome, 'skipped'>,
  { label: string; tone: ChipTone }
> = {
  pending: { label: 'Ждёт выпуска', tone: 'neutral' },
  issued: { label: 'Выпущен', tone: 'progress' },
  queued: { label: 'В очереди', tone: 'progress' },
  sent: { label: 'Отправлено', tone: 'progress' },
  delivered: { label: 'Доставлено', tone: 'done' },
  opened: { label: 'Прочитано', tone: 'done' },
  failed: { label: 'Не дошло', tone: 'error' },
  changed: { label: 'Изменён', tone: 'warn' },
};

/** Подсказка при наведении: то, что не влезло в одно-два слова на плашке. */
export function outcomeHint(outcome: RowOutcome, mailStatus: RecipientRow['mailStatus']): string {
  switch (outcome) {
    case 'skipped':
      return 'Не в выпуске';
    case 'pending':
      return 'Отмечен, документа ещё нет';
    case 'issued':
      return 'Документ есть, письмо не отправляли';
    case 'queued':
      return 'Письмо ждёт отправки';
    case 'sent':
      return 'Письмо ушло, почта получателя пока не ответила';
    case 'delivered':
      return 'Письмо доставлено';
    case 'opened':
      return 'Письмо открыли';
    case 'failed':
      return mailStatus === 'bounced' ? 'Адрес не принял письмо' : 'Письмо не отправилось';
    case 'changed':
      return 'Данные поправили после выпуска — документ устарел';
  }
}
