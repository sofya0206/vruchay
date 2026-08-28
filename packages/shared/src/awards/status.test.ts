import { describe, expect, it } from 'vitest';
import { parseStatus } from './status';

describe('parseStatus', () => {
  it('пустая графа и прочерк значат «в зачёте»', () => {
    expect(parseStatus('')).toBe('ok');
    expect(parseStatus('   ')).toBe('ok');
    expect(parseStatus('-')).toBe('ok');
    expect(parseStatus('—')).toBe('ok');
    expect(parseStatus(null)).toBe('ok');
    expect(parseStatus(undefined)).toBe('ok');
  });

  it('читает латинские сокращения', () => {
    expect(parseStatus('DSQ')).toBe('dsq');
    expect(parseStatus('dns')).toBe('dns');
    expect(parseStatus('DNF')).toBe('dnf');
    expect(parseStatus('DNQ')).toBe('dnq');
  });

  it('читает русские написания', () => {
    expect(parseStatus('дисквалифицирован')).toBe('dsq');
    expect(parseStatus('дискв.')).toBe('dsq');
    expect(parseStatus('не стартовал')).toBe('dns');
    expect(parseStatus('неявка')).toBe('dns');
    expect(parseStatus('н/я')).toBe('dns');
    expect(parseStatus('сошёл')).toBe('dnf');
    expect(parseStatus('сошел с дистанции')).toBe('dnf');
    expect(parseStatus('не финишировал')).toBe('dnf');
    expect(parseStatus('не допущен')).toBe('dnq');
  });

  it('отделяет «снят» от дисквалификации', () => {
    expect(parseStatus('снят')).toBe('withdrawn');
    expect(parseStatus('снята')).toBe('withdrawn');
    expect(parseStatus('отказ')).toBe('withdrawn');
    // Дисквалификация упомянута явно — она сильнее слова «снят».
    expect(parseStatus('дисквалифицирован, снят')).toBe('dsq');
  });

  it('положительные отметки читает как зачёт', () => {
    expect(parseStatus('финиш')).toBe('ok');
    expect(parseStatus('зачёт')).toBe('ok');
    expect(parseStatus('+')).toBe('ok');
  });

  it('нераспознанное отдаёт как null, а не как зачёт', () => {
    expect(parseStatus('см. протокол')).toBeNull();
    expect(parseStatus('???')).toBeNull();
  });

  it('не принимает за зачёт отметку, которая начинается со слова «зачёт»', () => {
    // «зачёт аннулирован» — это ровно наоборот. Проверка по началу строки
    // выдавала такому участнику грамоту.
    expect(parseStatus('зачёт аннулирован')).toBeNull();
    expect(parseStatus('зачет отменён')).toBeNull();
    expect(parseStatus('да, но вне конкурса')).toBeNull();
    // Само слово по-прежнему читается.
    expect(parseStatus('зачёт')).toBe('ok');
    expect(parseStatus('финишировал')).toBe('ok');
  });
});
