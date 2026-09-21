import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { checkRecords, dmarcRecord, ownershipRecord } from './dns-check';
import { headersFor } from './smtp.provider';
import { parseMailWebhook, SERVICE_REF_PREFIX } from './webhook-events';
import {
  PermanentSendError,
  type DnsRecord,
  type DomainStatus,
  type MailProvider,
  type NormalizedEvent,
  type OutgoingMessage,
} from './mail-provider.interface';
import type { Env } from '../config/env';

/**
 * Отправка через транзакционное API DashaMail (dashamail.ru/api).
 *
 * Зачем API, когда у DashaMail есть SMTP-шлюз: почтовые порты у хостера
 * могут быть закрыты, и тогда SMTP держится на запасном 2525. API ходит
 * по HTTPS — его это не касается. Заодно DashaMail возвращает в вебхуках
 * наш идентификатор письма (`message_id`), и уведомление о доставке
 * находит письмо точно, а не по адресу получателя.
 *
 * Версия API — v2: ключ идёт заголовком, а не параметром адреса, и не
 * может осесть в журналах прокси или в тексте ошибки.
 *
 * Условие DashaMail: отправлять можно только с домена, подключённого
 * к нашему аккаунту и подписанного их ключом DKIM. Поэтому домен
 * организации при заявке регистрируется в DashaMail, и владельцу
 * показываются их записи SPF и DKIM вместо записей SMTP-шлюза.
 */
export class DashaMailProvider implements MailProvider {
  readonly name = 'dashamail';
  private readonly logger = new Logger(DashaMailProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(message: OutgoingMessage): Promise<{ providerMessageId: string }> {
    const payload = await sendPayload(message);
    let body: unknown;
    try {
      body = await this.call('POST', '/transactional/messages', payload);
    } catch (err) {
      if (err instanceof DashaMailRefusal && !err.retryable) {
        throw new PermanentSendError(err.message, { cause: err });
      }
      throw err;
    }

    const id = transactionId(body);
    if (!id) {
      // Ответ без идентификатора и без кода — не наш формат. Считать письмо
      // ушедшим нельзя: в реестре появилось бы «отправлено» на пустом месте.
      throw new Error('DashaMail ответил без номера письма — отправка не подтверждена');
    }
    return { providerMessageId: id };
  }

  async getDomainSetup(domain: string, verificationToken: string): Promise<DnsRecord[]> {
    const issued = await this.registerDomain(domain);
    return [ownershipRecord(verificationToken), ...issued, dmarcRecord(domain)];
  }

  /**
   * Своя проверка DNS — и проверка DashaMail.
   *
   * Видеть записи мало нам: письмо пропустит только DashaMail, когда увидит
   * их сам, а его резолверы обновляются по своему расписанию. Пока он
   * не согласен, домен остаётся «ожидает» — иначе первое же письмо
   * организации упало бы с отказом «домен не настроен».
   */
  async checkDomain(domain: string, records: DnsRecord[]): Promise<DomainStatus> {
    const ours = await checkRecords(domain, records);
    if (ours !== 'verified') return ours;

    try {
      const body = await this.call('GET', '/account/domains/check', undefined, { domain });
      const theirs = issuedRecords(body, domain);
      return theirs.length > 0 && theirs.every((r) => r.valid) ? 'verified' : 'pending';
    } catch (err) {
      this.logger.warn(`Проверка домена ${domain} в DashaMail: ${(err as Error).message}`);
      return 'pending';
    }
  }

  parseWebhook(body: unknown): NormalizedEvent[] {
    return parseMailWebhook(body);
  }

  /**
   * Подключает домен к нашему аккаунту DashaMail и возвращает его записи.
   *
   * Домен из аккаунта при удалении у нас не убирается: он мог быть
   * добавлен вручную (как общий vruchay.ru) или заявлен другой
   * организацией, и удаление сломало бы отправку им.
   */
  private async registerDomain(domain: string): Promise<DnsRecord[]> {
    let body: unknown;
    try {
      try {
        body = await this.call('POST', '/account/domains', { domain });
      } catch (err) {
        // Код 56: домен уже есть — у нас (повторная заявка, другая
        // организация) или в чужом аккаунте. Свой отдаст проверка.
        if (!(err instanceof DashaMailRefusal) || err.code !== 56) throw err;
        body = await this.call('GET', '/account/domains/check', undefined, { domain });
        if (issuedRecords(body, domain).length === 0) {
          throw new BadRequestException(
            'Этот домен уже подключён к другому аккаунту DashaMail. Если он ваш, напишите в поддержку',
          );
        }
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      if (err instanceof DashaMailRefusal && err.code === 54) {
        throw new BadRequestException('Почтовый сервис не принимает такое имя домена');
      }
      this.logger.error(`Подключение домена ${domain} в DashaMail: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Не удалось подключить домен в почтовом сервисе. Попробуйте позже или напишите в поддержку',
      );
    }

    const records = issuedRecords(body, domain).map(({ valid: _valid, ...record }) => record);
    if (!records.some((r) => r.host.endsWith('_domainkey'))) {
      // Без ключа DKIM с домена не уйдёт ни одно письмо, а заявка выглядела бы
      // готовой. Пишем имена полей ответа — по ним видно, что поправить в разборе.
      this.logger.error(
        `DashaMail не выдал DKIM для ${domain}. Поля ответа: ${fieldNames(body).join(', ') || '—'}`,
      );
      throw new ServiceUnavailableException(
        'Почтовый сервис не выдал ключ подписи для домена. Напишите в поддержку',
      );
    }
    if (!records.some((r) => r.value.toLowerCase().startsWith('v=spf1'))) {
      records.unshift(spfRecord(`v=spf1 include:${SPF_INCLUDE} ~all`));
    }
    return records;
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    payload?: Record<string, unknown>,
    query?: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(`${API}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.get('DASHAMAIL_API_KEY', { infer: true })}`,
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // Сеть или таймаут — повторяемо: очередь попробует ещё раз.
      throw new Error(`DashaMail не ответил: ${(err as Error).message}`, { cause: err });
    }

    const body = parseJson(await res.text());
    const refusal = refusalOf(res.status, body);
    if (refusal) throw refusal;
    return body;
  }
}

const API = 'https://api.dashamail.com/v2';
/** Вложение до 5 МБ уходит одним запросом — полминуты хватает с запасом. */
const TIMEOUT_MS = 30_000;
/** Что DashaMail просит включить в SPF — из их ответа на подключение домена. */
const SPF_INCLUDE = '_spf.dashasender.ru';

/**
 * Отказ DashaMail с кодом.
 *
 * v2 отвечает честным HTTP-статусом и `{"error":{"code","message"}}`,
 * старое API — всегда 200 и кодом в `response.msg.err_code`. Разбираем оба:
 * по документации это один и тот же движок, и что вернётся на отдельных
 * ручках, заранее не угадать.
 */
export class DashaMailRefusal extends Error {
  override readonly name = 'DashaMailRefusal';

  constructor(
    readonly status: number,
    readonly code: number,
    detail: string,
  ) {
    const hint = HINTS[code];
    const text = detail.slice(0, 300);
    super(hint ? `DashaMail: ${hint} (код ${code}; ${text})` : `DashaMail: ${text} (код ${code})`);
  }

  /**
   * Есть ли смысл повторять. Лимит запросов и сбой на их стороне — да.
   * Ключ, тариф, неподтверждённый отправитель, адрес в чёрном списке —
   * нет: через пять минут ответ будет тем же.
   */
  get retryable(): boolean {
    if (this.status === 429 || this.code === 58) return true;
    if (PERMANENT_CODES.has(this.code)) return false;
    return !(this.status >= 400 && this.status < 500);
  }
}

/**
 * Пояснения к кодам, после которых надо что-то сделать руками.
 * Коды — dashamail.ru/api/errors и dashamail.ru/codes.
 */
const HINTS: Record<number, string> = {
  1: 'ключ API не принят',
  2: 'у ключа API нет прав',
  4: 'API недоступно на тарифе или аккаунт на модерации',
  6: 'некорректный адрес получателя или отправителя',
  26: 'вложение больше разрешённого размера',
  29: 'одноразовый адрес получателя',
  30: 'отправка приостановлена DashaMail',
  33: 'вложение в неподдерживаемом формате',
  34: 'домен отправителя не подключён в DashaMail',
  35: 'нет средств на счёте или функция недоступна на тарифе',
  43: 'адрес в чёрном списке',
  44: 'адрес в чёрном списке',
  45: 'адрес в чёрном списке',
  46: 'адрес в глобальном списке недоставляемых',
  47: 'IP сервера не в списке разрешённых',
  51: 'отправка с общего почтового домена запрещена его DMARC',
  52: 'адрес отправителя не подтверждён в DashaMail',
  58: 'превышен лимит запросов',
  62: 'у ключа API нет права на отправку',
  401: 'ключ API не принят',
};

const PERMANENT_CODES = new Set([
  1, 2, 3, 4, 6, 26, 29, 30, 33, 34, 35, 40, 43, 44, 45, 46, 47, 51, 52, 54, 62, 101, 999,
]);

export function refusalOf(status: number, body: unknown): DashaMailRefusal | null {
  const error = field(body, 'error');
  if (isRecord(error)) {
    return new DashaMailRefusal(
      status,
      asNumber(error.code) ?? status,
      asString(error.message) ?? `HTTP ${status}`,
    );
  }

  const msg = field(field(body, 'response'), 'msg');
  const code = asNumber(field(msg, 'err_code'));
  if (code !== undefined && code !== 0) {
    return new DashaMailRefusal(status, code, asString(field(msg, 'text')) ?? 'без пояснения');
  }

  if (status >= 400) return new DashaMailRefusal(status, status, `HTTP ${status}`);
  return null;
}

/**
 * Тело запроса на отправку.
 *
 * Вложенные значения — строкой JSON: по документации DashaMail строка
 * работает на любой ручке, а настоящий массив — только «где допустимо».
 */
export async function sendPayload(message: OutgoingMessage): Promise<Record<string, unknown>> {
  // DashaMail делит `to` по запятой и понимает форму «Имя <адрес>».
  // Проверка адреса у нас такие символы в имени ящика пропускает, и один
  // адрес превратился бы в рассылку по нескольким.
  if (/[,;<>\s]/.test(message.to.trim())) {
    throw new PermanentSendError(
      'Адрес получателя с запятой, скобками или пробелом не отправляется',
    );
  }

  const headers: Record<string, string> = { ...headersFor(message) };
  if (message.replyTo) headers['Reply-To'] = message.replyTo;
  for (const key of Object.keys(headers)) headers[key] = headers[key].replace(/[\r\n]+/g, ' ');

  const payload: Record<string, unknown> = {
    to: message.to.trim(),
    from_email: message.from.email,
    from_name: message.from.name,
    subject: message.subject,
    message: message.html,
    // Письмо под своим номером: DashaMail возвращает его в вебхуках, и
    // уведомление находит письмо точно. У служебных писем журнала нет —
    // им номер с пометкой, чтобы их события не легли на чужое письмо.
    message_id: message.reference || `${SERVICE_REF_PREFIX}${randomUUID()}`,
    // Открытия считает наш пиксель, а подмена ссылок на домен трекера
    // отправила бы ссылки на документ через чужой сервер.
    no_track_opens: 1,
    no_track_clicks: 1,
  };
  if (Object.keys(headers).length > 0) payload.headers = JSON.stringify(headers);

  if (message.attachments?.length) {
    const files = await Promise.all(
      message.attachments.map(async (a) => ({
        name: attachmentName(a.filename),
        filebody: (await toBuffer(a.content)).toString('base64'),
      })),
    );
    payload.attachments = JSON.stringify(files);
  }
  return payload;
}

/**
 * Имя вложения без знаков препинания.
 *
 * DashaMail не принимает в имени файла спецсимволы и пунктуацию, включая `%`,
 * а имя документа собирается из ФИО: «Иванов И.И..pdf».
 */
export function attachmentName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot + 1) : '';
  const base = (dot > 0 && /^[a-z0-9]{1,8}$/i.test(ext) ? filename.slice(0, dot) : filename)
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const suffix = /^[a-z0-9]{1,8}$/i.test(ext) ? `.${ext.toLowerCase()}` : '';
  return `${base || 'Документ'}${suffix}`;
}

function transactionId(body: unknown): string | undefined {
  const id = field(field(field(body, 'response'), 'data'), 'transaction_id');
  if (typeof id === 'number') return String(id);
  return asString(id);
}

type IssuedRecord = DnsRecord & { valid: boolean };

/**
 * TXT-записи домена из ответа DashaMail — SPF и DKIM.
 *
 * Где лежит список, в документации показано на примере, а не схемой, поэтому
 * ищем записи по форме (`record_type`, `name`, `value`) на любой глубине.
 * Имя приходит полным, с точкой на конце: `dm2._domainkey.example.ru.`,
 * а владельцу домена нужно короткое, как у остальных наших записей.
 * CNAME на домен статистики пропускаем: отслеживание переходов выключено.
 */
export function issuedRecords(body: unknown, domain: string): IssuedRecord[] {
  const out = new Map<string, IssuedRecord>();

  const visit = (value: unknown, depth: number) => {
    if (depth > 5 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    const record = value as Record<string, unknown>;
    const type = asString(record.record_type)?.toUpperCase();
    const name = asString(record.name)?.toLowerCase().replace(/\.$/, '');
    const content = asString(record.value);
    if (type && name && content) {
      if (type !== 'TXT') return;
      if (name !== domain && !name.endsWith(`.${domain}`)) return;
      const host = name === domain ? '@' : name.slice(0, -(domain.length + 1));
      const valid = record.valid === true || record.valid === 1 || record.valid === '1';
      const base = content.toLowerCase().startsWith('v=spf1')
        ? spfRecord(content)
        : {
            type: 'TXT' as const,
            host,
            value: content,
            purpose: host.endsWith('_domainkey')
              ? 'DKIM: подпись писем ключом DashaMail — по ней почта получателя видит, что письмо от вас'
              : 'Запись DashaMail для подключения домена',
          };
      out.set(`${base.type}-${base.host}`, { ...base, valid });
      return;
    }
    Object.values(record).forEach((nested) => visit(nested, depth + 1));
  };

  visit(body, 0);
  return [...out.values()];
}

function spfRecord(value: string): DnsRecord {
  return {
    type: 'TXT',
    host: '@',
    value,
    purpose:
      `SPF: разрешает DashaMail отправлять письма от вашего домена. Запись SPF должна быть одна — ` +
      `если она уже есть, допишите в неё include:${SPF_INCLUDE}`,
  };
}

async function toBuffer(content: Buffer | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(content)) return content;
  const chunks: Buffer[] = [];
  for await (const chunk of content) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

/** Имена полей ответа без значений — для журнала, когда формат не сошёлся. */
function fieldNames(body: unknown): string[] {
  const names = new Set<string>();
  const collect = (value: unknown, depth: number) => {
    if (depth > 3 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) return collect(value[0], depth);
    for (const [key, nested] of Object.entries(value)) {
      names.add(key);
      collect(nested, depth + 1);
    }
  };
  collect(body, 0);
  return [...names].slice(0, 40);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function field(v: unknown, key: string): unknown {
  return isRecord(v) ? v[key] : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v);
  return undefined;
}
