import { plural } from '../registry/registry-format';

/*
 * Подписи к цифрам аналитики.
 *
 * Вынесено из разметки, потому что здесь легко ошибиться незаметно:
 * доля, которой не от чего считаться, и продолжительность в минутах,
 * которую человек читает часами.
 */

/**
 * Доля процентами. Пусто — не ноль.
 *
 * «0% пакетов без ошибок» у организации, которая ещё ничего не выпускала,
 * читается как поломка сервиса, а не как отсутствие данных.
 */
export function formatShare(share: number | null): string {
  if (share === null) return '—';
  // Округляем до целых: доля 12,7% и доля 13% означают на переговорах
  // одно и то же, а дробь создаёт видимость точности.
  return `${Math.round(share * 100)}%`;
}

/**
 * Сколько времени прошло — словами.
 *
 * Ориентир по времени до первого документа — десять минут, поэтому
 * минуты называем точно, а всё, что дольше суток, огрубляем: разница
 * между «три дня» и «трое суток четыре часа» ни на что не влияет.
 */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return 'меньше минуты';
  if (minutes < 60) return `${minutes} ${plural(minutes, 'минута', 'минуты', 'минут')}`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, 'час', 'часа', 'часов')}`;

  const days = Math.round(hours / 24);
  return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

/** Число с разрядами: 12 480, а не 12480. */
export function formatCount(value: number): string {
  return value.toLocaleString('ru-RU');
}

/**
 * Уложились ли в ориентир.
 *
 * Отдельная функция, а не сравнение в разметке: ориентир приходит
 * с сервера, и правило «меньше или равно» должно быть в одном месте.
 */
export function withinTarget(minutes: number | null, targetMinutes: number): boolean {
  return minutes !== null && minutes <= targetMinutes;
}
