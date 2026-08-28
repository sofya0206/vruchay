import type { LogItem } from './api';

/**
 * Подстановка данных получателя в тему и текст письма.
 *
 * Смысл предпросмотра в том, чтобы увидеть готовое письмо, а не разметку:
 * «Здравствуйте, %name» ничего не проверяет. Переменную, для которой
 * данных нет, оставляем как есть — это и есть сигнал, что колонку
 * в таблице забыли заполнить.
 */
export function fillVariables(text: string, values: Record<string, string>): string {
  return text.replace(/%([a-zA-Z][a-zA-Z0-9_]*)/g, (whole, name: string) => values[name] ?? whole);
}

/**
 * Значения для предпросмотра: сперва настоящие данные получателя,
 * потом заглушки по остальным колонкам.
 *
 * Настоящие данные важнее выдуманных: чаще всего в письме вылезает
 * не опечатка, а слишком длинная фамилия или пустая колонка.
 */
export function previewValues(
  row: Record<string, string> | undefined,
  columns: string[],
): Record<string, string> {
  const values: Record<string, string> = { ...(row ?? {}) };
  for (const column of columns) {
    if (!values[column]) values[column] = `значение ${column}`;
  }
  return values;
}

export const STATUS_LABELS: Record<LogItem['status'], string> = {
  queued: 'в очереди',
  sent: 'отправлено',
  delivered: 'доставлено',
  opened: 'прочитано',
  bounced: 'не доставлено',
  failed: 'не доставлено',
};

/** Состояние показываем не только словом: цвет и форма читаются быстрее. */
export function statusTone(status: LogItem['status']): 'neutral' | 'progress' | 'done' | 'danger' {
  if (status === 'bounced' || status === 'failed') return 'danger';
  if (status === 'opened' || status === 'delivered') return 'done';
  if (status === 'sent') return 'progress';
  return 'neutral';
}

/** Есть ли что переотправлять — по этому включается кнопка повтора. */
export function undeliveredCount(summary: Partial<Record<LogItem['status'], number>>): number {
  return (summary.bounced ?? 0) + (summary.failed ?? 0);
}
