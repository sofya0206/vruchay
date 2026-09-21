import { useEffect } from 'react';

/**
 * Мета-теги страницы.
 *
 * Ставятся из кода, а не в index.html, потому что у каждой публичной
 * страницы они свои. Работает это благодаря предварительной отрисовке:
 * скрипт сборки сохраняет разметку уже после того, как теги проставлены,
 * поэтому робот видит их сразу.
 *
 * Разметка данных (JSON-LD) идёт тем же путём. Она формируется из тех же
 * значений, что показаны на странице: расходиться им нельзя — поисковики
 * считают несовпадение разметки и видимого текста обманом.
 */

const SITE = 'https://vruchay.ru';

/** Картинка превью по умолчанию — одна на все публичные страницы, 1200×630. */
const DEFAULT_OG_IMAGE = `${SITE}/og-image.png`;

interface Props {
  title: string;
  description: string;
  path: string;
  /** Закрыть от индексации: страницы ошибок и кабинета в выдаче не нужны. */
  noindex?: boolean;
  jsonLd?: object;
  /** Своя картинка превью вместо общей — абсолютный URL. */
  image?: string;
}

function upsert(selector: string, create: () => HTMLElement, apply: (el: HTMLElement) => void) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  apply(el);
}

export function Meta({ title, description, path, noindex, jsonLd, image }: Props) {
  useEffect(() => {
    document.title = title;

    const meta = (name: string, value: string, prop = false) =>
      upsert(
        `meta[${prop ? 'property' : 'name'}="${name}"]`,
        () => {
          const el = document.createElement('meta');
          el.setAttribute(prop ? 'property' : 'name', name);
          return el;
        },
        (el) => el.setAttribute('content', value),
      );

    meta('description', description);
    meta('robots', noindex ? 'noindex, nofollow' : 'index, follow');

    // Как ссылка выглядит при пересылке. В B2B заметная часть переходов
    // приходит из мессенджеров, а не из выдачи.
    meta('og:title', title, true);
    meta('og:description', description, true);
    meta('og:url', SITE + path, true);
    meta('og:type', 'website', true);
    meta('og:locale', 'ru_RU', true);
    meta('og:site_name', 'Вручай', true);
    meta('og:image', image ?? DEFAULT_OG_IMAGE, true);
    meta('twitter:card', 'summary_large_image');
    meta('twitter:image', image ?? DEFAULT_OG_IMAGE);

    upsert(
      'link[rel="canonical"]',
      () => {
        const el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        return el;
      },
      (el) => el.setAttribute('href', SITE + path),
    );

    if (jsonLd) {
      upsert(
        'script[type="application/ld+json"]',
        () => {
          const el = document.createElement('script');
          el.setAttribute('type', 'application/ld+json');
          return el;
        },
        (el) => {
          el.textContent = JSON.stringify(jsonLd);
        },
      );
    }
  }, [title, description, path, noindex, jsonLd, image]);

  return null;
}
