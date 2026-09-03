import { describe, expect, it } from 'vitest';
import {
  parseFrontMatter,
  groups,
  findPage,
  loadBody,
  PAGES,
  HOME_SLUG,
  type DocPage,
} from './content';

/*
 * База знаний собирается из файлов, а не пишется руками в компоненте.
 * Ошибка разбора не падает, а тихо выкидывает страницу из навигации —
 * поэтому проверяется именно разбор и порядок разделов.
 */

describe('разбор фронтматтера', () => {
  it('достаёт поля и отделяет тело', () => {
    const { meta, body } = parseFrontMatter(
      '---\nmethod: POST\npath: /api/documents\nauth: token\n---\n\n# Заголовок\n\nТекст.',
    );

    expect(meta.method).toBe('POST');
    expect(meta.path).toBe('/api/documents');
    expect(meta.auth).toBe('token');
    expect(body.startsWith('# Заголовок')).toBe(true);
  });

  it('переживает файл без фронтматтера', () => {
    const { meta, body } = parseFrontMatter('# Просто текст');
    expect(meta).toEqual({});
    expect(body).toBe('# Просто текст');
  });

  it('не спотыкается о двоеточие в значении', () => {
    const { meta } = parseFrontMatter('---\ntitle: Ошибки: коды и разбор\n---\nтекст');
    expect(meta.title).toBe('Ошибки: коды и разбор');
  });
});

describe('разделы навигации', () => {
  const pages: DocPage[] = [
    { slug: 'errors', title: 'Ошибки', meta: {} },
    { slug: 'README', title: 'Обзор', meta: {} },
    { slug: 'reference/layout', title: 'Макет', meta: {} },
    { slug: 'endpoints/registry/get-registry', title: 'Реестр', meta: { group: 'registry' } },
  ];

  it('ставит обзор первым, а справочники последними', () => {
    const nav = groups(pages);
    expect(nav[0].key).toBe('guides');
    expect(nav[0].pages[0].slug).toBe('README');
    expect(nav[nav.length - 1].key).toBe('reference');
  });

  it('группирует эндпоинты по полю group, а не по папке', () => {
    const nav = groups(pages);
    const registry = nav.find((g) => g.key === 'registry');
    expect(registry?.pages).toHaveLength(1);
    // Название раздела переведено на русский, а не показано ключом.
    expect(registry?.title).toBe('Реестр');
  });
});

describe('собранное содержимое', () => {
  it('содержит обзор — с него открывается раздел', () => {
    expect(findPage(HOME_SLUG)).toBeDefined();
  });

  it('отдаёт текст страницы по требованию, а не держит его в памяти', async () => {
    const body = await loadBody(HOME_SLUG);
    expect(body).toContain('# API сервиса');
    // Фронтматтер снят: на страницу он не выводится.
    expect(body?.startsWith('---')).toBe(false);
  });

  it('на несуществующей странице возвращает null, а не падает', async () => {
    expect(await loadBody('нет-такой-страницы')).toBeNull();
  });

  it('у каждой страницы эндпоинта есть метод и адрес', () => {
    const endpoints = PAGES.filter((p) => p.slug.startsWith('endpoints/'));
    expect(endpoints.length).toBeGreaterThan(0);

    const broken = endpoints.filter((p) => !p.meta.method || !p.meta.path);
    expect(broken.map((p) => p.slug)).toEqual([]);
  });
});
