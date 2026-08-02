/**
 * Проверка источника публичного запроса.
 *
 * Токен интеграции лежит в HTML страницы клиента и виден всем — это данность.
 * Поэтому единственное, что отличает запрос с сайта федерации от запроса
 * злоумышленника, — заголовок источника. Защита не абсолютная (заголовок
 * подделывается из curl), но отсекает встраивание нашей формы на чужой сайт,
 * а от прямых запросов защищают подтверждение адреса и лимиты.
 */

/** Приводит Origin или Referer к имени хоста без порта и www. */
export function hostFrom(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
}

/**
 * Разрешён ли источник. Поддомены считаются своими: у федераций часто
 * отдельная страница на поддомене вроде edu.example.ru.
 */
export function isOriginAllowed(
  origin: string | undefined,
  referer: string | undefined,
  allowedDomains: string[],
): boolean {
  if (allowedDomains.length === 0) return false;

  // Origin надёжнее: его выставляет браузер и подделать со страницы нельзя.
  const host = hostFrom(origin) ?? hostFrom(referer);
  if (!host) return false;

  return allowedDomains.some((raw) => {
    const allowed = normalizeDomain(raw);
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}
