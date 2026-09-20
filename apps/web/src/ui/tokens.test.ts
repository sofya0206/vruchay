import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Контраст палитры — WCAG AA: текст 4,5 : 1, крупный текст и значки 3 : 1.
 * Проверяем обе темы по тем же токенам, которые читают компоненты.
 * Правки цвета тогда ломают тест, а не зрение у людей.
 */
const css = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].replace(/\s+/g, ' ').trim();
  return out;
}

const light = block(':root {');
const dark = { ...light, ...block(":root[data-scheme='dark']") };

function resolve(vars: Record<string, string>, value: string, depth = 0): string {
  const m = value.match(/^var\((--[\w-]+)\)$/);
  if (!m) return value;
  if (depth > 10) throw new Error(`цикл в ${value}`);
  return resolve(vars, vars[m[1]] ?? '', depth + 1);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(vars: Record<string, string>, fg: string, bg: string): number {
  const a = resolve(vars, vars[fg]);
  const b = resolve(vars, vars[bg]);
  if (!/^#[0-9a-f]{3,6}$/i.test(a) || !/^#[0-9a-f]{3,6}$/i.test(b)) return Infinity;
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ['--text', '--ground'],
  ['--text', '--surface'],
  ['--text-muted', '--surface'],
  ['--text-muted', '--surface-sunken'],
  ['--accent', '--surface'],
  ['--accent-contrast', '--accent-button'],
  ['--danger', '--surface'],
  ['--ok', '--surface'],
  ['--warn', '--surface'],
  ['--accent', '--accent-soft'],
  ['--danger', '--danger-soft'],
  ['--ok', '--ok-soft'],
  ['--warn', '--warn-soft'],
];

describe.each([
  ['светлая', light],
  ['тёмная', dark],
])('палитра, %s тема', (_name, vars) => {
  it.each(TEXT_PAIRS)('%s на %s читается: не ниже 4,5 : 1', (fg, bg) => {
    expect(contrast(vars, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('бумага листа не следует теме', () => {
    expect(resolve(vars, vars['--sheet-paper'])).toBe('#ffffff');
  });
});
