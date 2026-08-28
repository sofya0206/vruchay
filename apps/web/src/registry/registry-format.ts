import type { RegistryRow } from '../api/registry';

/**
 * Подписи для реестра.
 *
 * Вынесены из разметки отдельным файлом не ради порядка, а ради проверки:
 * различие между «отозван» и «заменён» — главное, что раздел обязан
 * говорить правильно, и оно должно быть покрыто тестами, а не рассуждениями
 * о том, что мы написали в JSX.
 */

/** Что показать в столбце «состояние». */
export function stateLabel(row: Pick<RegistryRow, 'state' | 'reissuePending'>): string {
  if (row.state === 'revoked') return 'Отозван';
  if (row.state === 'replaced') return 'Заменён';
  // Обещанный перевыпуск — ещё не замена: документ действителен, пока
  // нового нет.
  return row.reissuePending ? 'Перевыпускается' : 'Действителен';
}

export type Tone = 'ok' | 'wait' | 'warn' | 'bad' | 'mute';

export function stateTone(row: Pick<RegistryRow, 'state' | 'reissuePending'>): Tone {
  if (row.state === 'revoked') return 'bad';
  if (row.state === 'replaced') return 'warn';
  return row.reissuePending ? 'wait' : 'ok';
}

const MAIL_LABELS: Record<string, string> = {
  queued: 'В очереди',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  opened: 'Прочитано',
  bounced: 'Не доставлено',
  failed: 'Ошибка отправки',
};

export function mailLabel(status: string | null | undefined): string {
  if (!status) return 'Не отправлялось';
  return MAIL_LABELS[status] ?? status;
}

export function mailTone(status: string | null | undefined): Tone {
  if (!status) return 'mute';
  if (status === 'opened' || status === 'delivered') return 'ok';
  if (status === 'bounced' || status === 'failed') return 'bad';
  return 'wait';
}

/**
 * Когда файлы будут стёрты по сроку хранения.
 *
 * Пока материал не в корзине, срока нет, и придумывать его нельзя: молчание
 * здесь честнее выдуманной даты. Как только материал отправлен в корзину,
 * счёт пошёл, и человек обязан увидеть его до того, как документы исчезнут
 * (ч. 7 ст. 5 152-ФЗ — хранить не дольше, чем требует цель).
 */
export function retentionLabel(retention: RegistryRow['retention']): string | null {
  if (!retention) return null;
  if (retention.daysLeft === 0) return 'Удаление сегодня ночью';
  return `Удаление через ${retention.daysLeft} ${plural(retention.daysLeft, 'день', 'дня', 'дней')}`;
}

/**
 * Русское склонение после числа.
 *
 * «Удаление через 2 дней» портит доверие к разделу ровно там, где раздел
 * говорит о безвозвратном удалении.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** «Сертификат проверили 47 раз» — главная цифра раздела. */
export function verifyLabel(count: number): string {
  if (count === 0) return 'Ни разу не проверяли';
  return `Проверяли ${count} ${plural(count, 'раз', 'раза', 'раз')}`;
}

const DATE = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});

const DATE_TIME = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

/**
 * Дата по Москве, а не по часовому поясу браузера.
 *
 * Реестр — документ отчётности: федерация в Иркутске и её проверяющий
 * в Москве должны видеть у одной и той же грамоты одну и ту же дату выдачи.
 */
export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
