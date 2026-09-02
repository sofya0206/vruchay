import { useEffect, useState } from 'react';
import { resolveRichDoc, sheetLayout, type SheetLayout } from '@gramota/shared';
import { runFace } from '../render/RichText';
import { SheetRenderer } from '../render/SheetRenderer';
import { SHEET_SELECTOR, overlayProblem, probePoints } from '../render/overlay-guard';

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
 * Поля подставляем той же функцией, что и рендер: в шаблоне стоит поле
 * «name», а печатается кириллическое имя — то есть совсем другое
 * подмножество. И идём по прогонам, а не по блокам: полужирная фамилия
 * внутри обычной строки — отдельное начертание, и спросить надо и про него.
 */
export function usedFonts(state: Pick<RenderData, 'sheets' | 'data'>): UsedFont[] {
  const byKey = new Map<string, UsedFont>();
  const add = (face: { family: string; weight: number; style: 'normal' | 'italic' }, text: string) => {
    const key = `${face.family}|${face.weight}|${face.style}`;
    const seen = byKey.get(key);
    if (seen) seen.text += text;
    else byKey.set(key, { ...face, text });
  };

  for (const sheet of state.sheets) {
    for (const element of sheet.layout) {
      if (element.type !== 'text' || !element.props.fontFamily || element.hidden) continue;
      const blocks = resolveRichDoc(element.props.doc, { data: state.data ?? {}, unfilled: 'blank' });
      for (const block of blocks) {
        if (block.marker) add(runFace(element.props, undefined), block.marker);
        for (const node of block.content) {
          if (node.type === 'break' || node.text === '') continue;
          add(runFace(element.props, node.marks), node.text);
        }
      }
    }
  }
  return [...byKey.values()];
}

/**
 * Макеты с сервера проходят разбор схемы здесь, на входе.
 *
 * Сервер отдаёт лист так, как он лежит в базе, а там ещё долго будут
 * макеты первой версии — с текстом строкой. Разбор превращает их в дерево
 * на лету; без него страница печати получила бы блок без `doc` и упала.
 */
export function normalizeRenderData(raw: RenderData): RenderData {
  return { ...raw, sheets: raw.sheets.map((s) => ({ ...s, layout: sheetLayout.parse(s.layout) })) };
}

/**
 * Точки листа, в которых проверяется, что сверху только он.
 *
 * Берём первый лист: окно браузера воркера ровно с него размером,
 * остальные листы за его краем, и спрашивать про них не о чем.
 */
function sheetPoints(): [number, number][] {
  const sheet = document.querySelector(SHEET_SELECTOR);
  if (!sheet) return [];
  return probePoints(sheet.getBoundingClientRect(), {
    width: window.innerWidth,
    height: window.innerHeight,
  });
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
      .then((raw) => setState(normalizeRenderData(raw)))
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

      // Та же мера, что и со шрифтами, и по той же причине: печатать
      // бракованный документ хуже, чем не печатать. Заставка приложения
      // однажды уже уехала в грамоты непрозрачным слоем поверх фамилии,
      // и заметили это не мы, а награждённые.
      const overlay = overlayProblem(document, sheetPoints());
      if (overlay) {
        window.__RENDER_ERROR__ = `Лист закрыт посторонним слоем: ${overlay}`;
        return;
      }

      window.__RENDER_READY__ = true;
    });
  }, [state]);

  if (!state) return null;

  return (
    <>
      {state.sheets.map((sheet, i) => (
        // data-sheet — признак листа для проверки «сверху только лист».
        <div
          key={i}
          data-sheet
          style={{ breakAfter: i < state.sheets.length - 1 ? 'page' : 'auto' }}
        >
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
