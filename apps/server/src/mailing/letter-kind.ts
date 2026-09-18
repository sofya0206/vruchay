import { escapeHtml } from '../mail/mail-template';

/**
 * Два потока отправки, разведённые в коде.
 *
 * Транзакционное письмо — выдача документа, ссылка на него, уведомление
 * об истечении срока. Это переписка по существу отношений, согласия
 * по ст. 18 ФЗ «О рекламе» она не требует.
 *
 * Рекламное — только с согласием, с отпиской и с записью в журнале согласий.
 *
 * Ловушка, ради которой всё и разведено: рекламный кусок внутри
 * транзакционного письма делает рекламным письмо целиком. Штраф по ст. 14.3
 * КоАП для юрлица — от 300 тысяч до миллиона рублей, и считается он за
 * каждый факт отправки, то есть за каждое письмо в рассылке.
 *
 * Поэтому у транзакционного письма здесь попросту нет способа получить
 * рекламный блок: тип письма — размеченное объединение, и поля
 * рекламодателя и отписки существуют только у рекламной ветки. Ошибиться
 * можно было бы только дописав сюда новый код, а не заполнив форму
 * не тем способом.
 */
export type LetterKind = 'transactional' | 'marketing';

export const LETTER_KIND_LABELS: Record<LetterKind, string> = {
  transactional: 'выдача документа',
  marketing: 'реклама',
};

/** Письмо о документе: вложение, ссылка, срок. Рекламе тут места нет. */
export interface TransactionalLetter {
  kind: 'transactional';
  bodyHtml: string;
  /**
   * Подпись отправителя из настроек: «С уважением, приёмная комиссия».
   * Её пишет сама организация, поэтому письмо по-прежнему уходит только
   * тем, что написал оператор, — просто часть текста задана один раз
   * на отправителя, а не в каждом шаблоне.
   */
  signature?: string;
}

/** Рекламное письмо: рекламодатель и отписка обязательны, не по желанию. */
export interface MarketingLetter {
  kind: 'marketing';
  bodyHtml: string;
  advertiserName: string;
  unsubscribeUrl: string;
}

export type Letter = TransactionalLetter | MarketingLetter;

/**
 * Тело письма для отправки.
 *
 * Единственная точка сборки: и рассылка, и тестовая отправка зовут её,
 * поэтому «в тесте было одно, участнику ушло другое» не получится.
 */
export function renderLetterBody(letter: Letter): string {
  if (letter.kind === 'marketing') {
    return letter.bodyHtml + marketingFooter(letter.advertiserName, letter.unsubscribeUrl);
  }
  /*
   * Транзакционное письмо уходит ровно тем, что написал оператор:
   * его текстом и его подписью. Ни рекламного низа, ни ссылки отписки —
   * отписка от выдачи собственного документа бессмысленна, а «Реклама»
   * на таком письме была бы признанием того, чего не было.
   *
   * Подпись отделена чертой: иначе она сливается с текстом письма,
   * и участник читает её как продолжение сообщения о награждении.
   */
  const signature = letter.signature?.trim();
  if (!signature) return letter.bodyHtml;
  return (
    letter.bodyHtml +
    '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e1e9f0;' +
    'color:#36394a;font-size:14px">' +
    signature +
    '</div>'
  );
}

/**
 * Низ рекламного письма.
 *
 * Пометка «Реклама» и рекламодатель — ст. 18: получатель должен понимать,
 * что перед ним реклама и чья именно. Отписка — там же: без работающего
 * отказа рассылка незаконна независимо от того, было согласие или нет.
 */
function marketingFooter(advertiserName: string, unsubscribeUrl: string): string {
  return (
    '<hr style="margin:24px 0;border:none;border-top:1px solid #e1e9f0">' +
    '<p style="font-size:12px;color:#36394a;margin:0 0 8px">' +
    `Реклама. ${escapeHtml(advertiserName)}` +
    '</p>' +
    '<p style="font-size:12px;color:#36394a;margin:0">' +
    `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#36394a">Отписаться от рассылки</a>` +
    '</p>'
  );
}

/**
 * Почему шаблон нельзя взять в этот поток. null — можно.
 *
 * Отдельной функцией, чтобы проверку нельзя было «забыть включить»
 * в одном из мест отправки: их три — рассылка, тестовое письмо
 * и переотправка недоставленных.
 */
export function templateKindRefusal(sendKind: LetterKind, templateKind: LetterKind): string | null {
  if (sendKind === templateKind) return null;
  return sendKind === 'transactional'
    ? 'Рекламный текст нельзя отправить письмом о выдаче документа: такое письмо целиком считается рекламой'
    : 'Для рекламной рассылки нужен рекламный текст письма, а не письмо о выдаче документа';
}

/**
 * Чего не хватает рекламному шаблону, чтобы его вообще можно было отправить.
 *
 * Проверяем при сохранении и ещё раз перед отправкой: рекламодателя могли
 * стереть уже после того, как шаблон завели.
 */
export function marketingSetupRefusal(advertiserName: string | null | undefined): string | null {
  return advertiserName?.trim()
    ? null
    : 'Укажите рекламодателя: по закону получатель должен видеть, чья это реклама';
}

/** Адрес страницы отказа от рассылки для конкретного письма. */
export function unsubscribeUrl(publicUrl: string, emailId: string): string {
  return `${publicUrl.replace(/\/+$/, '')}/api/v1/u/${emailId}`;
}
