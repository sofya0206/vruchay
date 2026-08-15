import type { NormalizedEvent } from './mail-provider.interface';

export type EmailStatus = 'queued' | 'sent' | 'delivered' | 'opened' | 'bounced' | 'failed';

/**
 * Порядок жизни письма. Событие может двигать состояние только вперёд.
 *
 * Уведомления от провайдера приходят не по порядку: «доставлено» вполне
 * может прийти после «открыто» — доставку подтверждает сервер получателя,
 * а открытие фиксирует картинка, и путь у них разный. Наивная запись
 * затирала бы прочтение доставкой, и в реестре у прочитавшего участника
 * значилось бы «доставлено».
 */
const RANK: Record<EmailStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  // Провалы стоят выше всего: «не доставлено» — это конец пути, и никакое
  // запоздавшее «отправлено» не должно его отменять.
  bounced: 4,
  failed: 4,
};

/**
 * Какое состояние ставить, или null — если менять нечего.
 *
 * Возвращает null и когда состояние то же самое: лишняя запись в базу
 * при каждом повторе уведомления никому не нужна, а повторы — норма,
 * провайдеры шлют их до подтверждения приёма.
 */
export function advanceStatus(
  current: EmailStatus,
  event: NormalizedEvent['type'],
): EmailStatus | null {
  const next = event as EmailStatus;
  if (!(next in RANK)) return null;
  return RANK[next] > RANK[current] ? next : null;
}
