import { substituteVariables } from '@gramota/shared';

/**
 * Подготовка письма из шаблона.
 *
 * Данные получателя приходят из загруженного клиентом файла, то есть это
 * недоверенный ввод. Он подставляется в HTML письма, поэтому экранируется:
 * иначе фамилия вида `<img src=x onerror=...>` превратится в работающий код
 * в почтовом клиенте получателя.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Подстановка переменных в HTML: значения экранируются, шаблон — нет. */
export function renderHtmlTemplate(template: string, data: Record<string, string>): string {
  const escaped = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, escapeHtml(value)]),
  );
  return substituteVariables(template, escaped);
}

/** Тема письма — обычный текст, экранировать не нужно, но переводы строк убираем. */
export function renderSubject(template: string, data: Record<string, string>): string {
  return substituteVariables(template, data).replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Проверка адреса перед постановкой в очередь.
 * Списки участников приходят из Excel, и там регулярно встречаются
 * пустые ячейки, «нет почты» и адреса с пробелами.
 */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(trimmed);
}
