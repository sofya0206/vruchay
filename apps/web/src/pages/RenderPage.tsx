import { useEffect, useState } from 'react';
import type { SheetLayout } from '@gramota/shared';
import { SheetRenderer } from '../render/SheetRenderer';

interface RenderData {
  pageWidthMm: number;
  pageHeightMm: number;
  sheets: { layout: SheetLayout; backgroundUrl: string | null }[];
  data: Record<string, string>;
}

declare global {
  interface Window {
    /** Флаг для воркера: страница отрисована, шрифты и картинки загружены. */
    __RENDER_READY__?: boolean;
    __RENDER_ERROR__?: string;
  }
}

/**
 * Страница, которую браузер воркера печатает в PDF.
 *
 * Здесь нет ни шапки, ни масштабирования: лист выводится в натуральную величину
 * в миллиметрах тем же компонентом, что и в редакторе. Совпадение результата
 * с тем, что видел пользователь, обеспечивается общим кодом, а не настройками печати.
 */
export function RenderPage() {
  const [state, setState] = useState<RenderData | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      window.__RENDER_ERROR__ = 'Не передан токен';
      return;
    }

    fetch(`/api/render/${encodeURIComponent(token)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Сервер ответил ${r.status}`);
        return r.json() as Promise<RenderData>;
      })
      .then(setState)
      .catch((err: Error) => {
        window.__RENDER_ERROR__ = err.message;
      });
  }, []);

  useEffect(() => {
    if (!state) return;
    // Готовность объявляем только после загрузки шрифтов и всех изображений,
    // иначе фон попадёт в PDF пустым, а текст — запасным шрифтом.
    const images = [...document.images].map((img) =>
      img.complete ? Promise.resolve() : new Promise((res) => {
        img.addEventListener('load', () => res(null), { once: true });
        img.addEventListener('error', () => res(null), { once: true });
      }),
    );
    void Promise.all([document.fonts.ready, ...images]).then(() => {
      window.__RENDER_READY__ = true;
    });
  }, [state]);

  if (!state) return null;

  return (
    <>
      {state.sheets.map((sheet, i) => (
        <div key={i} style={{ breakAfter: i < state.sheets.length - 1 ? 'page' : 'auto' }}>
          <SheetRenderer
            layout={sheet.layout}
            pageWidthMm={state.pageWidthMm}
            pageHeightMm={state.pageHeightMm}
            backgroundUrl={sheet.backgroundUrl}
            data={state.data}
          />
        </div>
      ))}
    </>
  );
}
