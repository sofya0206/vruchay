import { describe, expect, it } from 'vitest';
import { sheetLayout, extractVariables, VARIABLE_RE } from './layout';
import { PAGE_FORMATS, rotate } from './page-sizes';
import {
  buildStarterLayout,
  buildStarterSheet,
  DOCUMENT_CATEGORIES,
  findStarterPreset,
  isDocumentCategory,
  STARTER_PRESETS,
  PRESET_SAMPLE,
} from './starter-presets';
import { SYSTEM_VARIABLE_NAMES } from '../variables';
import { resolvePairedForms } from '../paired-forms';

/** Все форматы в обеих ориентациях: заготовка обязана лечь на любой из них. */
const SIZES = PAGE_FORMATS.flatMap((f) => [
  rotate(f, 'portrait'),
  rotate(f, 'landscape'),
]);

describe('заготовки', () => {
  it('раскладка проходит проверку схемы макета на всех форматах', () => {
    for (const preset of STARTER_PRESETS) {
      for (const size of SIZES) {
        const layout = buildStarterLayout(preset, {
          pageWidthMm: size.widthMm,
          pageHeightMm: size.heightMm,
        });
        const parsed = sheetLayout.safeParse(layout);
        expect(parsed.success, `${preset.id} ${size.widthMm}×${size.heightMm}`).toBe(true);
      }
    }
  });

  it('блоки не выходят за пределы листа', () => {
    for (const preset of STARTER_PRESETS) {
      for (const size of SIZES) {
        const layout = buildStarterLayout(preset, {
          pageWidthMm: size.widthMm,
          pageHeightMm: size.heightMm,
        });
        for (const el of layout) {
          const where = `${preset.id} ${size.widthMm}×${size.heightMm} ${el.id}`;
          expect(el.x, where).toBeGreaterThanOrEqual(0);
          expect(el.y, where).toBeGreaterThanOrEqual(0);
          expect(el.x + el.w, where).toBeLessThanOrEqual(size.widthMm + 0.01);
          expect(el.y + el.h, where).toBeLessThanOrEqual(size.heightMm + 0.01);
        }
      }
    }
  });

  it('блоки не наезжают друг на друга', () => {
    for (const preset of STARTER_PRESETS) {
      const layout = buildStarterLayout(preset, { pageWidthMm: 297, pageHeightMm: 210 });
      // Подвал стоит в две колонки, поэтому сравниваем только те, что во всю ширину.
      const rows = layout.filter((el) => el.w > 200).sort((a, b) => a.y - b.y);
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1];
        expect(rows[i].y, `${preset.id}: ${prev.id} → ${rows[i].id}`).toBeGreaterThanOrEqual(
          prev.y + prev.h - 0.01,
        );
      }
    }
  });

  /*
   * Главная проверка задачи. Заготовка печатается на трёхстах бумагах разом,
   * и переменная, которую сервис не умеет подставлять, превращается
   * в «%signer_role» на каждой из них — увидеть это можно только глазами.
   */
  it('используются только переменные, которые сервис умеет подставлять', () => {
    for (const preset of STARTER_PRESETS) {
      const known = new Set([...SYSTEM_VARIABLE_NAMES, ...preset.columns, 'place_word']);
      const layout = buildStarterLayout(preset, { pageWidthMm: 297, pageHeightMm: 210 });
      for (const name of extractVariables(layout)) {
        expect(known.has(name), `${preset.id}: неизвестная переменная %${name}`).toBe(true);
      }
    }
  });

  /*
   * Синтаксис родовых форм в текущем контракте — только черта: «прошёл|прошла».
   * Запись «%(прошёл|прошла)» из ветки layout-editor здесь не раскрывается
   * и уходит на бумагу как есть.
   */
  it('родовые формы записаны синтаксисом, который понимает текущий разбор', () => {
    for (const preset of STARTER_PRESETS) {
      for (const row of preset.rows) {
        expect(row.text, `${preset.id}: «${row.text}»`).not.toMatch(/%\(/);
      }
    }
  });

  it('родовая форма раскрывается по полу получателя', () => {
    const course = findStarterPreset('course-certificate');
    expect(course).not.toBeNull();
    const text = course!.rows.find((r) => r.text.includes('|'))!.text;

    expect(resolvePairedForms(text, 'male')).toContain('прошёл ');
    expect(resolvePairedForms(text, 'female')).toContain('прошла ');
    // Пол не определён — печатаем обе формы, а не роняем выпуск.
    expect(resolvePairedForms(text, 'unknown')).toContain('прошёл/прошла');
  });

  it('после подстановки не остаётся хвостов от переменных', () => {
    const preset = findStarterPreset('sport-award')!;
    const layout = buildStarterLayout(preset, { pageWidthMm: 297, pageHeightMm: 210 });
    const rendered = layout
      .filter((el) => el.type === 'text')
      .map((el) => (el.type === 'text' ? el.props.text : ''))
      .join(' ')
      .replace(VARIABLE_RE, 'X');
    expect(rendered).not.toContain('%');
  });

  it('лист заготовки помечен текущей версией схемы', () => {
    const sheet = buildStarterSheet(STARTER_PRESETS[0], {
      pageWidthMm: 297,
      pageHeightMm: 210,
    });
    expect(sheet.position).toBe(0);
    expect(sheet.schemaVersion).toBe(1);
    expect(sheet.layout.length).toBeGreaterThan(0);
  });

  it('у каждой заготовки есть колонка с именем — без неё печатать некого', () => {
    for (const preset of STARTER_PRESETS) {
      expect(preset.columns, preset.id).toContain('name');
    }
  });

  it('каждая заготовка лежит в известном разделе', () => {
    for (const preset of STARTER_PRESETS) {
      expect(isDocumentCategory(preset.category), preset.id).toBe(true);
    }
  });

  it('разделы и заготовки не дублируются по идентификатору', () => {
    expect(new Set(DOCUMENT_CATEGORIES.map((c) => c.id)).size).toBe(DOCUMENT_CATEGORIES.length);
    expect(new Set(STARTER_PRESETS.map((p) => p.id)).size).toBe(STARTER_PRESETS.length);
  });

  /*
   * Падеж имени. Заготовки печатали «Награждается Иванов» — именительный
   * после слова, которое требует дательного. На наградном документе это
   * не мелочь: его вешают на стену.
   *
   * Проверяем по самому листу, а не по описанию заготовки: между ними
   * стоит `buildStarterLayout`, и ошибиться можно в нём.
   */
  it('после «Награждается» и «Объявляется» имя стоит в дательном', () => {
    for (const preset of STARTER_PRESETS) {
      const labels = preset.rows.filter((r) => r.role === 'label').map((r) => r.text);
      if (!labels.some((t) => /^(Награждается|Объявляется)/.test(t))) continue;
      const names = preset.rows.filter((r) => r.role === 'name').map((r) => r.text);
      expect(names, preset.id).toEqual(['%name_dat']);
    }
  });

  it('после «подтверждает, что» имя остаётся в именительном', () => {
    // «подтверждает, что Иванову прошла» — тоже ошибка, только обратная.
    for (const preset of STARTER_PRESETS) {
      const labels = preset.rows.filter((r) => r.role === 'label').map((r) => r.text);
      if (!labels.some((t) => /подтверждает, что$/.test(t))) continue;
      const names = preset.rows.filter((r) => r.role === 'name').map((r) => r.text);
      expect(names, preset.id).toEqual(['%name']);
    }
  });

  /*
   * Витрина отдаёт образец прямо в отрисовку, минуя `mergeVariables`:
   * производные переменные она не вычисляет. Переменной без готового
   * значения хватит, чтобы на плашке заготовки осталась пустота вместо
   * имени, — а витрину и смотрят ради того, как заготовка выглядит.
   */
  it('на всё, что стоит в заготовке, у образца витрины есть значение', () => {
    for (const preset of STARTER_PRESETS) {
      const layout = buildStarterLayout(preset, { pageWidthMm: 297, pageHeightMm: 210 });
      for (const name of extractVariables(layout)) {
        expect(PRESET_SAMPLE[name], `${preset.id}: %${name}`).toBeTruthy();
      }
    }
  });

  it('несуществующая заготовка не находится', () => {
    expect(findStarterPreset('нет такой')).toBeNull();
    expect(isDocumentCategory('нет такого')).toBe(false);
  });
});
