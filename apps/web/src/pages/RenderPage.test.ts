import { describe, expect, it } from 'vitest';
import { sheetLayout } from '@gramota/shared';
import { usedFonts } from './RenderPage';

/*
 * Проверка собирает начертания, загрузку которых страница печати требует
 * перед выводом в PDF. Ошибиться здесь дорого в обе стороны: пропустишь
 * начертание — получишь пачку документов не тем шрифтом; потребуешь лишнего —
 * остановишь выпуск на исправном документе.
 *
 * Первая версия ошиблась именно так: спрашивала про семейство с весом
 * по умолчанию и запрещала любой полужирный текст. Отсюда тесты на вес,
 * стиль и подстановку переменных.
 *
 * Листы собираем через настоящую схему, а не приведением типа: приведение
 * скрыло бы расхождение с моделью данных.
 */

const base = { x: 0, y: 0, w: 50, h: 10, rotation: 0, z: 0 };

const sheet = (elements: unknown[]) => ({ layout: sheetLayout.parse(elements), backgroundUrl: null });

const text = (id: string, fontFamily: string, props: Record<string, unknown> = {}) => ({
  ...base,
  id,
  type: 'text',
  props: { text: 'Иванов', fontFamily, ...props },
});

describe('usedFonts', () => {
  it('собирает начертания со всех листов, а не только с первого', () => {
    const fonts = usedFonts({
      sheets: [sheet([text('a', 'PT Serif')]), sheet([text('b', 'Caveat')])],
      data: {},
    });
    expect(fonts.map((f) => f.family).sort()).toEqual(['Caveat', 'PT Serif']);
  });

  it('различает обычное и полужирное: это разные файлы шрифта', () => {
    const fonts = usedFonts({
      sheets: [
        sheet([
          text('a', 'Playfair Display'),
          text('b', 'Playfair Display', { bold: true }),
        ]),
      ],
      data: {},
    });
    expect(fonts.map((f) => f.weight).sort()).toEqual([400, 700]);
  });

  it('различает курсив', () => {
    const fonts = usedFonts({
      sheets: [sheet([text('a', 'Lora'), text('b', 'Lora', { italic: true })])],
      data: {},
    });
    expect(fonts.map((f) => f.style).sort()).toEqual(['italic', 'normal']);
  });

  it('одно и то же начертание не повторяется, тексты складываются', () => {
    const fonts = usedFonts({
      sheets: [sheet([text('a', 'Lora', { text: 'Первый' }), text('b', 'Lora', { text: 'Второй' })])],
      data: {},
    });
    expect(fonts).toHaveLength(1);
    expect(fonts[0].text).toBe('ПервыйВторой');
  });

  it('подставляет переменные: печатается имя, а не латинское «%name»', () => {
    const fonts = usedFonts({
      sheets: [sheet([text('a', 'PT Sans', { text: 'Награждается %name' })])],
      data: { name: 'Пётр Ильич' },
    });
    // Именно по тексту браузер выбирает файл подмножества: у «%name»
    // и у «Пётр Ильич» это разные файлы — латиница против кириллицы.
    expect(fonts[0].text).toBe('Награждается Пётр Ильич');
  });

  it('пропускает элементы без текста: у картинки и QR шрифта нет', () => {
    const image = {
      ...base,
      id: 'i',
      type: 'image',
      props: { fileId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' },
    };
    const qr = { ...base, id: 'q', type: 'qr', props: {} };
    const fonts = usedFonts({ sheets: [sheet([image, qr, text('t', 'Inter')])], data: {} });
    expect(fonts.map((f) => f.family)).toEqual(['Inter']);
  });

  it('на документе без текста не требует ни одного шрифта', () => {
    expect(usedFonts({ sheets: [sheet([])], data: {} })).toEqual([]);
  });
});

describe('usedFonts с марками', () => {
  it('полужирная фамилия внутри обычной строки — отдельное начертание', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Награждается ' },
            { type: 'mergeField', attrs: { source: 'name' }, marks: [{ type: 'bold' }] },
          ],
        },
      ],
    };
    const fonts = usedFonts({
      sheets: [sheet([{ ...base, id: 'a', type: 'text', props: { doc, fontFamily: 'PT Serif' } }])],
      data: { name: 'Иванов' },
    });
    expect(fonts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: 'PT Serif', weight: 400, text: 'Награждается ' }),
        expect.objectContaining({ family: 'PT Serif', weight: 700, text: 'Иванов' }),
      ]),
    );
  });

  it('гарнитура из марки — своё семейство', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Подпись: ' },
            { type: 'text', text: 'Иванов', marks: [{ type: 'textStyle', attrs: { fontFamily: 'Caveat' } }] },
          ],
        },
      ],
    };
    const fonts = usedFonts({
      sheets: [sheet([{ ...base, id: 'a', type: 'text', props: { doc, fontFamily: 'PT Sans' } }])],
      data: {},
    });
    expect(fonts.map((f) => f.family).sort()).toEqual(['Caveat', 'PT Sans']);
  });
});
