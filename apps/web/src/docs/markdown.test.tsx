import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { renderDoc, resolveLink } from './markdown';

/*
 * Справочник по API состоит из таблиц со схемами и примеров запросов.
 * Ошибка разбора не падает, а портит документ: съеденная строка таблицы
 * или разъехавшийся пример curl — это неверная документация, по которой
 * потом пишут интеграцию.
 */
function html(source: string, slug = 'endpoints/registry/get-registry'): string {
  return renderToStaticMarkup(
    <MemoryRouter>{renderDoc(source, { basePath: '/docs', slug })}</MemoryRouter>,
  );
}

describe('разбор документации', () => {
  it('сохраняет блок кода целиком, не разбирая его', () => {
    const out = html(
      '```bash\ncurl -H "Authorization: Bearer vru_x" \\\n  https://vruchay.ru/api\n```',
    );
    expect(out).toContain('<pre');
    expect(out).toContain('Authorization: Bearer vru_x');
    // Обратный слеш переноса строки обязан дожить до страницы: без него
    // пример не скопируется работающим.
    expect(out).toContain('\\');
  });

  it('не превращает содержимое блока кода в разметку', () => {
    const out = html('```json\n{ "message": "**не жирный**" }\n```');
    expect(out).not.toContain('<strong>');
  });

  it('показывает код внутри строки', () => {
    const out = html('Поле `orgId` берётся из токена.');
    expect(out).toContain('<code');
    expect(out).toContain('orgId');
  });

  it('собирает таблицу схемы со всеми строками', () => {
    const out = html('| Поле | Тип |\n| --- | --- |\n| name | string |\n| email | string |');
    expect(out).toContain('<table');
    expect(out).toContain('name');
    expect(out).toContain('email');
    expect((out.match(/<tr/g) ?? []).length).toBe(3);
  });

  it('ведёт ссылку на соседнюю страницу внутрь приложения', () => {
    const out = html('См. [Аутентификация](../../authentication.md)');
    expect(out).toContain('href="/docs/authentication"');
  });

  it('оставляет внешнюю ссылку внешней', () => {
    const out = html('Сайт: [vruchay.ru](https://vruchay.ru)');
    expect(out).toContain('href="https://vruchay.ru"');
  });
});

describe('разрешение относительных ссылок', () => {
  it('считает путь от текущей страницы', () => {
    expect(resolveLink('errors.md', 'README', '/docs')).toBe('/docs/errors');
    expect(
      resolveLink('../reference/layout.md', 'endpoints/documents/get-documents', '/docs'),
    ).toBe('/docs/endpoints/reference/layout');
  });

  it('не трогает внешние адреса и якоря', () => {
    expect(resolveLink('https://vruchay.ru', 'README', '/docs')).toBeNull();
    expect(resolveLink('#раздел', 'README', '/docs')).toBeNull();
  });
});
