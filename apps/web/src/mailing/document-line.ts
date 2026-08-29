import type { DocumentSummary } from '../api/types';
import { plural } from '../overview/format';

/**
 * Чем один материал в списке рассылки отличается от другого.
 *
 * Одного названия мало. «Грамота за место» лежит в библиотеке в трёх
 * экземплярах — за разные соревнования, с разными списками получателей, —
 * и в списке «что рассылаем» они выглядели одинаковыми строками. Ошибиться
 * в такой строке значит разослать письма не тем людям, а рассылка
 * необратима: отозвать отправленное письмо нельзя.
 *
 * Поэтому под названием собираем ровно то, чем материалы различаются:
 * мероприятие, дату его проведения, дату создания материала и число строк
 * в таблице получателей.
 */
export function documentLine(doc: DocumentSummary, now = new Date()): string {
  const parts: string[] = [];

  // Мероприятие первым: чаще всего именно оно и различает одноимённые
  // материалы. Молчать о том, что оно не заполнено, нельзя — иначе строка
  // без мероприятия неотличима от строки, у которой его не показали.
  parts.push(doc.eventName?.trim() || 'мероприятие не указано');

  const eventDate = doc.eventDate?.trim();
  if (eventDate) parts.push(eventDate);

  parts.push(`создан ${formatDay(doc.createdAt, now)}`);
  parts.push(recipientsPart(doc.recipientCount));

  return parts.join(' · ');
}

/** Сколько получателей в таблице материала — словами, а не голым числом. */
function recipientsPart(count: number | undefined): string {
  if (count === undefined) return 'получатели не считаны';
  if (count === 0) return 'список получателей пуст';
  return `${count} ${plural(count, 'получатель', 'получателя', 'получателей')}`;
}

const DAY = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Дата создания по Москве.
 *
 * Год у материалов этого года не пишем: «28.08» короче и читается быстрее,
 * а спутать его с прошлогодним нельзя — у тех год останется.
 */
function formatDay(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'неизвестно когда';

  const full = DAY.format(date);
  const sameYear = full.slice(-4) === DAY.format(now).slice(-4);
  return sameYear ? full.slice(0, 5) : full;
}
