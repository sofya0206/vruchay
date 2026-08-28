import type { EmailStatus } from '../mail/email-status';

/**
 * Причина недоставки словами.
 *
 * В базе лежит ответ почтового шлюза: «550 5.1.1 <i***@example.ru>:
 * Recipient address rejected: User unknown in local recipient table».
 * Человеку, который разбирается, почему трое участников из ста не получили
 * грамоту, эта строка не говорит ничего, а решение у каждой причины разное:
 * несуществующий адрес надо исправить в таблице, переполненный ящик —
 * повторить завтра, отказ по политике домена — писать с другого домена.
 *
 * Технический текст при этом не выбрасываем, а показываем рядом мелким:
 * поддержке он нужен, а человеку без него спокойнее.
 */

interface Rule {
  reason: string;
  /** Есть ли смысл в повторной отправке тому же адресу. */
  retryable: boolean;
  match: RegExp;
}

/*
 * Порядок важен: правила проверяются сверху вниз, и более узкое должно
 * стоять раньше общего. «Mailbox unavailable» — это и «нет такого ящика»,
 * и «ящик переполнен», поэтому переполнение ищем первым по слову quota.
 */
const RULES: Rule[] = [
  {
    reason: 'Ящик получателя переполнен — письмо не поместилось',
    retryable: true,
    match: /quota|mailbox\s*full|over\s*quota|insufficient\s+system\s+storage|552|4\.2\.2|5\.2\.2/i,
  },
  {
    reason: 'Такого адреса не существует',
    retryable: false,
    match:
      /user\s*unknown|no\s*such\s*user|unknown\s*user|recipient\s*(address\s*)?rejected|does\s*not\s*exist|invalid\s*(recipient|mailbox|address)|address\s*not\s*found|unrouteable|5\.1\.1|5\.1\.[36]/i,
  },
  {
    reason: 'Почта получателя отклонила письмо по своим правилам',
    retryable: false,
    match:
      /polic(y|ies)|spam|blocked|blacklist|blocklist|dmarc|dkim|spf|reputation|not\s*allowed|access\s*denied|5\.7\.\d+|554/i,
  },
  {
    reason: 'Почта получателя временно недоступна — попробуйте позже',
    retryable: true,
    match: /try\s*again|temporar|greylist|deferred|too\s*many|rate\s*limit|4\.\d\.\d|4[25]\d\s/i,
  },
  {
    reason: 'Не удалось связаться с почтовым сервером получателя',
    retryable: true,
    match: /etimedout|econnrefused|econnreset|enotfound|edns|timeout|getaddrinfo|dns/i,
  },
  {
    reason: 'Домен получателя не принимает почту',
    retryable: false,
    match: /no\s*mx|domain\s*not\s*found|host\s*unknown|5\.1\.2/i,
  },
];

export interface DeliveryProblem {
  reason: string;
  retryable: boolean;
  /** Ответ шлюза как есть — для поддержки, не для витрины. */
  details: string | null;
}

/**
 * Что случилось с письмом. null — с ним всё в порядке.
 *
 * Уведомление о недоставке приходит и без текста: провайдер сообщает
 * «bounced» и молчит о причине. Тогда честнее сказать «не доставлено,
 * причину почта получателя не сообщила», чем гадать.
 */
export function deliveryProblem(
  status: EmailStatus,
  error: string | null,
): DeliveryProblem | null {
  if (status !== 'bounced' && status !== 'failed') return null;

  const text = error?.trim() ?? '';
  if (!text) {
    return {
      reason: 'Письмо не доставлено, причину почта получателя не сообщила',
      // Причина неизвестна — значит, могла быть и временной. Повторить даём:
      // это дешевле, чем оставить участника без документа из-за нашего незнания.
      retryable: true,
      details: null,
    };
  }

  const rule = RULES.find((r) => r.match.test(text));
  return {
    reason: rule?.reason ?? 'Письмо не доставлено',
    retryable: rule?.retryable ?? true,
    details: text,
  };
}
