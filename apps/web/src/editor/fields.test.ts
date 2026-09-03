import { describe, expect, it } from 'vitest';
import { mergeField, paragraph, sheetLayout, textRun } from '@gramota/shared';
import {
  applyMatches,
  bestMatch,
  fieldRegistry,
  levenshtein,
  normalizeFieldName,
  proposeMatches,
} from './fields';

/**
 * Автосопоставление — главный путь, ручная вставка — запасной.
 *
 * Шаблон ломается переименованием колонки или опечаткой в ключе, и чинить
 * это руками значит знать про ключи. Здесь проверяется, что самые частые
 * поломки чинятся сами и что осторожность не подводит: похожая колонка
 * не подменяет ту, что и так есть.
 */

const columns = [
  { id: 'c1', name: 'ФИО' },
  { id: 'c2', name: 'Место' },
  { id: 'c3', name: 'email' },
];

describe('нормализация', () => {
  it('регистр, ё, пробелы и подчёркивания не считаются, кириллица и латиница — одно', () => {
    expect(normalizeFieldName('Ф.И.О.')).toBe(normalizeFieldName('fio'));
    expect(normalizeFieldName('Место_в турнире')).toBe(normalizeFieldName('mesto v turnire'));
    expect(normalizeFieldName('Ёж')).toBe(normalizeFieldName('еж'));
  });

  it('расстояние Левенштейна', () => {
    expect(levenshtein('фамилия', 'фамилиия')).toBe(1);
    expect(levenshtein('место', 'тесто')).toBe(1);
    expect(levenshtein('name', 'place')).toBeGreaterThan(2);
  });
});

describe('подбор колонки', () => {
  it('точное совпадение сильнее синонима, синоним сильнее опечатки', () => {
    expect(bestMatch('name', columns)?.name).toBe('ФИО');
    expect(bestMatch('place', columns)?.name).toBe('Место');
    expect(bestMatch('emial', columns)?.name).toBe('email');
  });

  it('три правки — уже другое слово', () => {
    expect(bestMatch('xyzw', columns)).toBeNull();
  });
});

describe('сопоставление макета', () => {
  const layout = sheetLayout.parse([
    {
      id: 'a',
      type: 'text',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      props: {
        doc: {
          type: 'doc',
          content: [paragraph([mergeField('fio'), textRun(' — '), mergeField('mesto'), mergeField('email')])],
        },
      },
    },
  ]);

  it('предлагает только пропавшие поля', () => {
    const matches = proposeMatches(layout, columns);
    expect(matches.map((m) => [m.from, m.to.name])).toEqual([
      ['fio', 'ФИО'],
      ['mesto', 'Место'],
    ]);
  });

  it('применяет сопоставление и запоминает идентификатор колонки', () => {
    const fixed = applyMatches(layout, proposeMatches(layout, columns));
    const el = fixed[0];
    if (el.type !== 'text') throw new Error('не текст');
    const block = el.props.doc.content[0];
    if (block.type !== 'paragraph') throw new Error('не абзац');
    expect(block.content[0]).toMatchObject({ attrs: { source: 'ФИО', fieldId: 'c1' } });
    expect(block.content[2]).toMatchObject({ attrs: { source: 'Место', fieldId: 'c2' } });
  });

  it('одна колонка не достаётся двум полям', () => {
    const doubled = sheetLayout.parse([
      {
        ...layout[0],
        props: { doc: { type: 'doc', content: [paragraph([mergeField('fio'), mergeField('imya')])] } },
      },
    ]);
    const matches = proposeMatches(doubled, columns);
    expect(matches).toHaveLength(1);
  });
});

describe('список полей', () => {
  it('колонки первыми, служебные — без дублей с колонками', () => {
    const fields = fieldRegistry([{ id: 'c', name: 'date' }]);
    expect(fields[0]).toMatchObject({ source: 'date', kind: 'column' });
    expect(fields.filter((f) => f.source === 'date')).toHaveLength(1);
    expect(fields.some((f) => f.source === 'event' && f.kind === 'system')).toBe(true);
  });
});
