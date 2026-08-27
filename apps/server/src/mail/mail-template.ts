import sanitizeHtml from 'sanitize-html';
import { resolvePairedForms, rowGender, substituteForRow, substituteVariables } from '@gramota/shared';

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
  /*
   * Парные формы раскрываются здесь по тем же правилам, что и на грамоте:
   * иначе в письме напечаталось бы «награждён(а)» буквально, а в приложенном
   * к нему документе — «награждена», и получатель увидел бы обе версии рядом.
   *
   * Пол считаем по неэкранированным данным: экранирование меняет апострофы
   * и кавычки, а фамилии вроде «О'Коннор» встречаются.
   */
  const text = resolvePairedForms(template, rowGender(data));
  return substituteVariables(text, escaped);
}

/**
 * Очистка тела письма, которое пишет сам пользователь сервиса.
 *
 * Экранирование данных получателя защищает от подстановки через переменные,
 * но сам шаблон — это тоже пользовательский ввод: его задаёт клиент через API,
 * и без очистки туда попадут скрипты, фреймы и ссылки `javascript:`.
 * Письмо уходит от имени клиентского домена, поэтому вредоносное содержимое
 * ударит и по получателям, и по репутации домена.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's',
      'h1', 'h2', 'h3', 'h4',
      'ul', 'ol', 'li', 'blockquote',
      'a', 'img', 'hr', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['style'],
    },
    // Схемы ссылок по белому списку: javascript: и data: отсекаются.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'cid'] },
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/],
        'background-color': [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/],
        'text-align': [/^left$|^right$|^center$/],
        'font-size': [/^\d+(?:px|pt|em|%)$/],
        'font-weight': [/^\d+$|^bold$|^normal$/],
        margin: [/^[\d\s.a-z%]+$/],
        padding: [/^[\d\s.a-z%]+$/],
      },
    },
    // Внешние ссылки в письме открываются в новой вкладке без доступа к opener.
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  });
}

/** Тема письма — обычный текст, экранировать не нужно, но переводы строк убираем. */
export function renderSubject(template: string, data: Record<string, string>): string {
  return substituteForRow(template, data).replace(/[\r\n]+/g, ' ').trim();
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
