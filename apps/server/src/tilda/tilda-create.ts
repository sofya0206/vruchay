/**
 * Разбор формы Тильды, пришедшей прямо на наш адрес.
 *
 * Второй способ подключения, кроме перехвата формы скриптом: клиент
 * вписывает наш адрес в «Свой скрипт для приёма данных» и не трогает
 * разметку страницы вовсе. Так устроено у сервиса, который мы заменяем,
 * и клиенту при переезде не приходится ничего переделывать.
 *
 * Тильда шлёт плоский набор полей. Наши переменные она отдаёт с приставкой
 * `mask_`: поле `mask_name` — это переменная `%name` в документе. Приставка
 * нужна, чтобы отделить наши поля от служебных полей самой Тильды, которых
 * в теле запроса больше, чем содержательных.
 */

/**
 * Служебные поля Тильды и наши собственные управляющие поля.
 *
 * В переменные документа они попасть не должны: `tranid` и `formid` — это
 * внутренние опознаватели отправки, а `COOKIES` — целая строка чужих кук,
 * которой в персональных данных участника взяться неоткуда.
 */
const RESERVED = new Set([
  // служебное самой Тильды
  'tranid',
  'formid',
  'formservices',
  'cookies',
  'sitename',
  'pageid',
  'projectid',
  'submittedat',
  'test',
  'referer',
  'url',
  // наше управляющее
  'secure',
  'doc_id',
  'consent',
  'consent_version',
  'consent_marketing',
  'website',
  'ma_name',
  'ma_email',
  // поля будущих шагов: пусть лучше молча игнорируются, чем станут переменными
  'mail_id',
  'email_send',
  'email_timeout_value',
  'email_timeout_unit',
  'email_timeout_timestamp',
  'folder_id',
  'page_id',
]);

/** Имя переменной документа: латиница, как и в остальном сервисе. */
const VARIABLE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Что получается из формы — ровно то, что ждёт submitSchema. */
export interface ParsedForm {
  token: string;
  documentId: string;
  email: string;
  accountEmail?: string;
  fields: Record<string, string>;
  consent: boolean;
  consentMarketing: boolean;
  consentVersion: string;
  website?: string;
}

/**
 * Одно значение из тела запроса.
 *
 * Тильда может прислать несколько значений под одним именем (флажки,
 * множественный выбор). Берём первое: переменная документа — это одна
 * строка, и склеивать сюда список значило бы вписать в грамоту
 * «Иванов, Петров».
 */
function one(value: unknown): string {
  if (Array.isArray(value)) return one(value[0]);
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * Отмечен ли флажок.
 *
 * Значение флажка в Тильде задаёт сам владелец сайта, и чаще всего это
 * подпись рядом с ним — «Согласен на обработку данных». Проверять на `on`
 * или `true` поэтому нельзя: у половины форм там русский текст. Считаем
 * отмеченным всё непустое, кроме явных отрицаний.
 */
function checked(value: unknown): boolean {
  const v = one(value).toLowerCase();
  if (!v) return false;
  return !['0', 'false', 'no', 'off', 'нет'].includes(v);
}

/**
 * Разбор тела запроса в заявку.
 *
 * Ничего не проверяет по существу — это делает Zod-схема следом. Здесь
 * только раскладка: где переменная, где служебное, где согласие.
 */
export function parseTildaForm(body: Record<string, unknown>): ParsedForm {
  // Имена полей приводим к нижнему регистру: Тильда шлёт `COOKIES`,
  // а в форме владелец сайта мог назвать поле `Mask_Name`.
  const raw = new Map<string, unknown>();
  for (const [key, value] of Object.entries(body)) {
    raw.set(key.trim().toLowerCase().replace(/\[\]$/, ''), value);
  }
  const get = (name: string): string => one(raw.get(name));

  const fields: Record<string, string> = {};
  for (const [key, value] of raw) {
    // Приставка необязательна: форму мог собрать человек, который читал
    // нашу прежнюю инструкцию, где поля назывались просто `name`.
    const name = key.startsWith('mask_') ? key.slice(5) : key;
    if (RESERVED.has(key) || RESERVED.has(name)) continue;
    if (name === 'email') continue;
    if (!VARIABLE.test(name) || name.length > 64) continue;

    const text = one(value);
    if (text) fields[name] = text.slice(0, 500);
  }

  // Имя из личного кабинета — только если своего человек не вписал.
  const accountName = get('ma_name');
  if (!fields.name && accountName) fields.name = accountName.slice(0, 500);

  const accountEmail = get('ma_email');

  return {
    token: get('secure'),
    documentId: get('doc_id'),
    // Адрес доставки: что человек вписал, иначе адрес его учётной записи.
    email: get('mask_email') || get('email') || accountEmail,
    accountEmail: accountEmail || undefined,
    fields,
    consent: checked(raw.get('consent')),
    consentMarketing: checked(raw.get('consent_marketing')),
    consentVersion: get('consent_version') || 'tilda-form',
    website: get('website') || undefined,
  };
}
