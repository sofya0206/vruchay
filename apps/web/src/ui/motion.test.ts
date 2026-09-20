import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Правила движения, за которыми глазами не уследить:
 * `transition: all` тянет за собой всё подряд и ломает производительность,
 * ease-in задерживает начало, появление из scale(0) выглядит как хлопок.
 * Пока проверяем кит, оболочку и стили; остальные папки — по мере переезда.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCOPES = ['ui', 'shell', 'styles'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

const files = SCOPES.flatMap((scope) => walk(join(ROOT, scope)));

/** Код без комментариев: правила — про то, что исполняется, а не про то, что объяснено. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('движение', () => {
  it('нет transition: all и transition-all', () => {
    const bad = files.filter((f) => /transition-all\b|transition:\s*all\b/.test(code(f)));
    expect(bad.map((f) => f.replace(ROOT, ''))).toEqual([]);
  });

  it('интерфейс не появляется из нуля', () => {
    const bad = files.filter((f) => /\bscale-0\b|scale\(0\)/.test(code(f)));
    expect(bad.map((f) => f.replace(ROOT, ''))).toEqual([]);
  });

  it('ease-in без out не используется', () => {
    const bad = files.filter((f) => /\bease-in\b(?!-out)/.test(code(f)));
    expect(bad.map((f) => f.replace(ROOT, ''))).toEqual([]);
  });
});
