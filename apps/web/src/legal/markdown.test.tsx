import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from './markdown';
import privacy from './privacy.md?raw';

/**
 * Разбор разметки проверяется тестами, потому что ошибка в нём не падает,
 * а тихо портит юридический документ: пропавшая строка таблицы со сроками
 * хранения или склеенный в одну кашу раздел — это уже другой текст,
 * чем тот, который читал юрист.
 */
function html(source: string): string {
  return renderToStaticMarkup(<>{renderMarkdown(source)}</>);
}

describe('разбор разметки', () => {
  it('делает заголовки разных уровней', () => {
    const out = html('# Первый\n\n## Второй\n\n### Третий');
    expect(out).toContain('<h1');
    expect(out).toContain('<h2');
    expect(out).toContain('<h3');
  });

  it('склеивает абзац из нескольких строк', () => {
    const out = html('Первая строка\nвторая строка.\n\nНовый абзац.');
    expect(out).toContain('Первая строка вторая строка.');
    expect((out.match(/<p /g) ?? []).length).toBe(2);
  });

  it('собирает список целиком', () => {
    const out = html('- один\n- два\n- три');
    expect((out.match(/<li>/g) ?? []).length).toBe(3);
  });

  it('разбирает таблицу без пустых ячеек по краям', () => {
    const out = html('| Что | Срок |\n|---|---|\n| Заявка | 1 год |\n| Согласие | 3 года |');
    expect((out.match(/<th /g) ?? []).length).toBe(2);
    // Ищем «<tr» без закрывающей скобки: у строк данных есть класс, у заголовка нет.
    expect((out.match(/<tr[ >]/g) ?? []).length).toBe(3);
    expect((out.match(/<td /g) ?? []).length).toBe(4);
    expect(out).toContain('3 года');
  });

  it('выделяет жирный шрифт и ссылки', () => {
    const out = html('Текст **важный** и [ссылка](https://vruchay.ru/privacy).');
    expect(out).toContain('<strong>важный</strong>');
    expect(out).toContain('href="https://vruchay.ru/privacy"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('не выводит внутренние заметки, оформленные цитатой', () => {
    const out = html('> Заметка для нас, наружу не идёт\n\nОбычный текст.');
    expect(out).not.toContain('Заметка для нас');
    expect(out).toContain('Обычный текст.');
  });

  it('не вставляет разметку из текста как разметку', () => {
    const out = html('Опасная строка <script>alert(1)</script> в тексте.');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

describe('политика обработки данных', () => {
  it('разбирается целиком и содержит обязательные разделы', () => {
    const out = html(privacy);
    expect(out).toContain('Политика в отношении обработки персональных данных');
    expect(out).toContain('Сроки хранения');
    // Таблица сроков — то, что проверяющий сверит с поведением системы.
    expect(out).toContain('90 дней');
    expect(out).toContain('3 года');
  });

  it('не содержит незаполненных мест, кроме данных предпринимателя', () => {
    // Эти подставляются при сборке из окружения; всё остальное должно быть
    // заполнено прямо в тексте, иначе документ уедет в публикацию с дырами.
    const allowed = new Set([
      'НАИМЕНОВАНИЕ',
      'ИНН',
      'ОГРНИП',
      'АДРЕС',
      'EMAIL',
      'ТЕЛЕФОН',
      'ДАТА_РЕДАКЦИИ',
    ]);
    const found = [...privacy.matchAll(/\{\{([A-ZА-ЯЁ_]+)\}\}/g)].map((m) => m[1]);
    expect(found.filter((name) => !allowed.has(name))).toEqual([]);
  });
});
