import { describe, expect, it } from 'vitest';
import { sanitizeEmailHtml } from './mail-template';

describe('очистка тела письма', () => {
  it('вырезает скрипты', () => {
    const clean = sanitizeEmailHtml('<p>Привет</p><script>fetch("//evil")</script>');
    expect(clean).not.toContain('script');
    expect(clean).toContain('<p>Привет</p>');
  });

  it('вырезает обработчики событий', () => {
    expect(sanitizeEmailHtml('<img src="x" onerror="alert(1)">')).not.toContain('onerror');
  });

  it('отсекает ссылки javascript: и data:', () => {
    expect(sanitizeEmailHtml('<a href="javascript:alert(1)">клик</a>')).not.toContain('javascript');
    expect(sanitizeEmailHtml('<a href="data:text/html,<script>1</script>">клик</a>')).not.toContain(
      'data:',
    );
  });

  it('вырезает фреймы и объекты', () => {
    const clean = sanitizeEmailHtml('<iframe src="//evil"></iframe><object data="x"></object>');
    expect(clean).not.toMatch(/iframe|object/);
  });

  it('сохраняет нормальную вёрстку письма', () => {
    const html =
      '<p>Здравствуйте, <b>%name</b>!</p><p><a href="https://vruchay.ru">Проверить документ</a></p>';
    const clean = sanitizeEmailHtml(html);
    expect(clean).toContain('<b>%name</b>');
    expect(clean).toContain('https://vruchay.ru');
    // Внешние ссылки открываются без доступа к странице-источнику.
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it('не ломает переменные подстановки', () => {
    expect(sanitizeEmailHtml('<p>%name, место %rank</p>')).toContain('%name, место %rank');
  });
});
