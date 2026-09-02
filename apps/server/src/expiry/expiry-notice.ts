import { escapeHtml } from '../mail/mail-template';

/**
 * Письмо о скором истечении срока действия документа.
 *
 * Текст сервиса, а не организации: у уведомления нет шаблона в кабинете,
 * и это намеренно. Оно уходит по расписанию без участия человека, и
 * организация не должна получить возможность превратить его в рассылку —
 * иначе транзакционное письмо стало бы рекламным вместе со всеми
 * последствиями по ст. 14.3 КоАП.
 *
 * Всё пользовательское экранируется: название материала и организации
 * задаёт клиент, и `<img onerror>` в них не должен превращаться в код
 * в почтовом клиенте участника.
 */
export interface ExpiryNoticeInput {
  title: string;
  eventName: string;
  orgName: string;
  expiresAt: Date;
  verifyUrl: string;
}

const DATE = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Moscow',
});

export function expiryNoticeLetter(input: ExpiryNoticeInput): {
  subject: string;
  bodyHtml: string;
} {
  const date = DATE.format(input.expiresAt);
  const title = escapeHtml(input.title.trim());
  const event = escapeHtml(input.eventName.trim());
  const org = escapeHtml(input.orgName.trim());
  const url = escapeHtml(input.verifyUrl);

  const about = event ? `«${title}» (${event})` : `«${title}»`;

  return {
    subject: `Срок действия документа «${input.title.trim()}» истекает ${date}`,
    bodyHtml:
      `<p style="font-size:15px">Здравствуйте!</p>` +
      `<p style="font-size:15px">Документ ${about}, выданный ${org ? `организацией ${org}` : 'вам'}, ` +
      `действителен до <strong>${date}</strong>.</p>` +
      `<p style="font-size:15px">После этой даты страница проверки будет показывать, что срок ` +
      `действия истёк. Если документ нужно продлить или получить заново — обратитесь ` +
      `в выдавшую организацию.</p>` +
      `<p style="font-size:15px">Проверить документ: <a href="${url}">${url}</a></p>`,
  };
}
