import type { NormalizedEvent } from './mail-provider.interface';

/**
 * Разбор уведомлений почтового провайдера.
 *
 * Вынесен отдельно от контроллера и от провайдера намеренно: это чистое
 * преобразование чужого JSON в наши события, и проверять его надо
 * таблицей примеров, а не поднятым приложением.
 *
 * Разбор нарочно терпимый — читает несколько написаний одних и тех же
 * полей. Причина не в лени: точный формат DashaMail мы увидим только
 * после подключения, а провайдера в этом проекте предполагается менять
 * (см. MailProvider). Строгая схема, написанная по памяти, дала бы
 * молчаливую потерю всех событий — то есть ровно то состояние, в котором
 * мы находимся сейчас, только с видимостью работы.
 *
 * Чего разбор НЕ делает: не верит телу ни в чём, кроме ссылки на письмо.
 * Ни адреса, ни организации, ни времени доставки из тела не берутся как
 * истина — по ссылке письмо ищется в базе, и всё остальное известно нам
 * самим.
 */

/** Как разные провайдеры называют одно и то же событие. */
const TYPE_ALIASES: Record<string, NormalizedEvent['type']> = {
  sent: 'sent',
  send: 'sent',
  accepted: 'sent',
  delivered: 'delivered',
  delivery: 'delivered',
  open: 'opened',
  opened: 'opened',
  bounce: 'bounced',
  bounced: 'bounced',
  hardbounce: 'bounced',
  hard_bounce: 'bounced',
  softbounce: 'bounced',
  soft_bounce: 'bounced',
  spam: 'bounced',
  complaint: 'bounced',
  abuse: 'bounced',
  reject: 'failed',
  rejected: 'failed',
  failed: 'failed',
  error: 'failed',
};

/** Где может лежать наш идентификатор письма. */
const REFERENCE_FIELDS = [
  'reference',
  'custom_id',
  'customId',
  'message_id',
  'messageId',
  'email_id',
  'emailId',
  'x-vruchay-ref',
  'X-Vruchay-Ref',
];

const TYPE_FIELDS = ['event', 'type', 'status', 'event_type', 'eventType'];
const TIME_FIELDS = ['occurred_at', 'occurredAt', 'timestamp', 'time', 'date', 'event_time'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Где может лежать идентификатор письма у самого провайдера. */
const PROVIDER_ID_FIELDS = [
  'message_id',
  'messageId',
  'transaction_id',
  'transactionId',
  'id',
  'msg_id',
];

/** Где может лежать адрес получателя. */
const EMAIL_FIELDS = ['email', 'to', 'to_email', 'recipient', 'address'];

/**
 * Разбирает уведомление.
 *
 * `defaultType` приходит из адреса, по которому постучались. Это не
 * запасной вариант на всякий случай, а основной путь для DashaMail:
 * у них в настройках отдельное поле адреса на каждое событие —
 * «Доставка», «Возвраты», «Жалоба на спам», — и в теле тип не приходит
 * вовсе, он определяется тем, куда постучались.
 *
 * Тип из тела, если он есть, всё равно сильнее: он точнее, а провайдера
 * мы собираемся менять.
 */
export function parseMailWebhook(
  body: unknown,
  defaultType?: NormalizedEvent['type'],
): NormalizedEvent[] {
  // Присылают и одно событие, и пачку, и пачку внутри поля.
  const items = toArray(body);
  const events: NormalizedEvent[] = [];

  for (const item of items) {
    if (!isRecord(item)) continue;

    const type = TYPE_ALIASES[(pickString(item, TYPE_FIELDS) ?? '').toLowerCase().trim()];
    const resolved = type ?? defaultType;
    if (!resolved) continue;

    const reference = pickString(item, REFERENCE_FIELDS);
    const ours = reference && UUID_RE.test(reference) ? reference : undefined;

    // Идентификатор провайдера и адрес получателя — запасные способы найти
    // письмо. Нужны потому, что своя ссылка возвращается не всегда:
    // мы кладём её в заголовок письма, а вернёт ли провайдер чужой
    // заголовок в уведомлении — его дело, не наше.
    const providerMessageId = ours ? undefined : pickString(item, PROVIDER_ID_FIELDS);
    const email = pickString(item, EMAIL_FIELDS)?.toLowerCase();

    // Совсем без примет письмо не найти — такое событие бесполезно.
    if (!ours && !providerMessageId && !email) continue;

    events.push({
      reference: ours ?? '',
      providerMessageId,
      email,
      type: resolved,
      occurredAt: pickDate(item, TIME_FIELDS) ?? new Date(),
      payload: item,
    });
  }

  return events;
}

function toArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!isRecord(body)) return [];
  for (const key of ['events', 'items', 'data', 'messages']) {
    const nested = body[key];
    if (Array.isArray(nested)) return nested;
  }
  return [body];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function pickString(item: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = item[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function pickDate(item: Record<string, unknown>, fields: string[]): Date | undefined {
  for (const field of fields) {
    const value = item[field];
    if (typeof value === 'number') {
      // Секунды или миллисекунды — по порядку величины. Значение в секундах
      // после 2001 года всегда больше 10^9, а в миллисекундах — больше 10^12.
      const ms = value > 1e12 ? value : value * 1000;
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) return date;
    }
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return undefined;
}
