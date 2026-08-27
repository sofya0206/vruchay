import { useEffect, useState } from 'react';
import { substituteForRow, type SheetLayout } from '@gramota/shared';
import { SheetRenderer } from '../render/SheetRenderer';

interface RenderData {
  pageWidthMm: number;
  pageHeightMm: number;
  sheets: { layout: SheetLayout; backgroundUrl: string | null }[];
  data: Record<string, string>;
  /** Адрес проверки подлинности этого экземпляра — для QR на листе. */
  verifyUrl?: string | null;
}

declare global {
  interface Window {
    /** Флаг для воркера: страница отрисована, шрифты и картинки загружены. */
    __RENDER_READY__?: boolean;
    __RENDER_ERROR__?: string;
  }
}

/** Начертание, которым набран хотя бы один блок документа. */
export interface UsedFont {
  family: string;
  /** 400 или 700 — ровно то, что попадёт в CSS */
  weight: number;
  style: 'normal' | 'italic';
  /** Весь текст, набранный этим начертанием, уже с подставленными переменными. */
  text: string;
}

/**
 * Начертания, которыми набран этот документ, — по всем листам.
 *
 * Проверять весь набор редактора смысла нет: документ обычно использует
 * два-три шрифта, а отказ из-за незагруженного восьмого остановил бы
 * выпуск на ровном месте.
 *
 * Начертания различаются, а не сводятся к семейству, по двум причинам,
 * и обе выяснились на боевой проверке:
 *
 *  — у многих семейств обычное и полужирное это разные файлы, и загрузка
 *    одного ничего не говорит о другом. Проверка «по семейству» с весом
 *    по умолчанию запрещала бы любой полужирный текст;
 *  — шрифты разбиты на подмножества по unicode-range, и браузер качает лишь
 *    те, что нужны показанным символам. Поэтому спрашивать надо про тот
 *    самый текст: кириллическое имя и латинский заголовок берут разные файлы.
 *
 * Переменные подставляем той же функцией, что и рендер: в шаблоне стоит
 * латинское «%name», а печатается кириллическое имя — то есть совсем
 * другое подмножество.
 */
export function usedFonts(state: Pick<RenderData, 'sheets' | 'data'>): UsedFont[] {
  const byKey = new Map<string, UsedFont>();
  for (const sheet of state.sheets) {
    for (const element of sheet.layout) {
      if (element.type !== 'text' || !element.props.fontFamily) continue;
      const { fontFamily: family, bold, italic } = element.props;
      const weight = bold ? 700 : 400;
      const style = italic ? 'italic' : 'normal';
      const key = `${family}|${weight}|${style}`;
      const text = substituteForRow(element.props.text, state.data ?? {});
      const seen = byKey.get(key);
      if (seen) seen.text += text;
      else byKey.set(key, { family, weight, style, text });
    }
  }
  return [...byKey.values()];
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
      // fonts.ready разрешается и тогда, когда шрифт загрузить не удалось:
      // он означает «загрузка завершилась», а не «завершилась успешно».
      // Поэтому спрашиваем про каждое начертание отдельно. Без этой проверки
      // недоступный шрифт даёт не ошибку, а пачку готовых документов,
      // напечатанных не тем шрифтом, — и заметит это уже получатель.
      const missing = usedFonts(state).filter(
        (f) => !document.fonts.check(`${f.style} ${f.weight} 16px "${f.family}"`, f.text || ' '),
      );
      if (missing.length) {
        const list = missing.map((f) => `${f.family} ${f.weight}${f.style === 'italic' ? ' курсив' : ''}`);
        window.__RENDER_ERROR__ = `Не загрузились шрифты: ${list.join(', ')}`;
        return;
      }
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
            verifyUrl={state.verifyUrl}
            data={state.data}
          />
        </div>
      ))}
    </>
  );
}
