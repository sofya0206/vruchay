/**
 * Отправитель на нашем домене — для организаций, которые ещё не подключили
 * свой. Задаётся переменной PLATFORM_MAIL_FROM в виде «Имя <адрес@домен>»
 * либо просто «адрес@домен».
 */

export interface ResolvedSender {
  email: string;
  displayName: string;
  /** Куда придёт ответ участника, если письмо уходит с нашего домена. */
  replyTo?: string;
  /** Есть только у отправителя на своём домене — по нему проверяется статус. */
  domainId?: string;
  /** Подпись из настроек отправителя; дописывается к транзакционному письму. */
  signature?: string;
}

/**
 * Разбирает строку вида «Вручай <noreply@vruchay.ru>».
 *
 * Возвращает null, если значение не задано или в нём нет похожего на адрес:
 * молча слать с непонятного адреса хуже, чем честно отказаться — письмо
 * всё равно не пройдёт проверку подписи и уйдёт в спам.
 */
export function parseMailFrom(raw: string | undefined): { email: string; name: string } | null {
  const value = raw?.trim();
  if (!value) return null;

  const angle = value.match(/^(.*?)<([^>]+)>$/);
  const email = (angle ? angle[2] : value).trim();
  // Достаточная проверка для значения из настроек: адрес задаём мы сами,
  // это защита от опечатки, а не от злоумышленника.
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email)) return null;

  const name = angle ? angle[1].trim().replace(/^"|"$/g, '') : '';
  return { email, name: name || 'Вручай' };
}

/**
 * Отправитель на нашем домене или null, если он не настроен.
 *
 * Обе строки передаются снаружи, из проверенной схемы настроек: файл
 * с разбором адреса не должен знать, откуда взялось значение, — иначе
 * его нельзя ни проверить тестом, ни переиспользовать.
 */
export function platformSender(
  platformMailFrom: string | undefined,
  serviceMailFrom: string,
): { email: string; name: string } | null {
  return parseMailFrom(platformMailFrom || serviceMailFrom);
}
