import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLANS, planPrice, hasPublicPrices, planGridClass, type Plan } from './plans';

/*
 * Публичных цен на сайте нет.
 *
 * Это не вкусовое требование, а решение о том, как продаётся сервис: объём
 * и стоимость обсуждаются в разговоре. Забытый ценник в одном компоненте
 * ломает не вёрстку, а сделку — человек приходит на разговор с цифрой,
 * которой мы ему не называли.
 *
 * Поэтому проверяем не отдельный компонент, а весь публичный текст сайта
 * разом: цену легко вернуть данными в plans.ts, но не текстом в разметке.
 */

const SRC = join(__dirname, '..');
const PUBLIC_PARTS = ['landing', 'seo', 'pages/LandingPage.tsx'];

/** Сумма в рублях: «29 000 ₽», «3₽», «149000 ₽». Пробел бывает неразрывным. */
const PRICE = /\d[\d\s\u00a0\u202f]*(₽|руб)/i;

function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (path: string, rel: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const next = join(path, entry.name);
      const nextRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(next, nextRel);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.'))
        out.push({ file: nextRel, text: readFileSync(next, 'utf8') });
    }
  };
  for (const part of PUBLIC_PARTS) {
    const full = join(SRC, part);
    if (part.endsWith('.tsx')) out.push({ file: part, text: readFileSync(full, 'utf8') });
    else walk(full, part);
  }
  return out;
}

describe('цена по договорённости', () => {
  it('в публичных страницах не осталось ни одной суммы', () => {
    const guilty = sources()
      .filter(({ text }) => PRICE.test(text))
      .map(({ file, text }) => `${file}: ${text.match(PRICE)?.[0]}`);
    expect(guilty).toEqual([]);
  });

  it('старых тарифных сумм нет даже цифрами', () => {
    const guilty = sources()
      .filter(({ text }) => /29\s?000|69\s?000|149\s?000|29000|69000|149000/.test(text))
      .map(({ file }) => file);
    expect(guilty).toEqual([]);
  });

  it('сейчас цену не публикуем ни по одному плану', () => {
    expect(hasPublicPrices()).toBe(false);
    expect(PLANS.map((p) => planPrice(p).value)).toEqual(PLANS.map(() => 'По договорённости'));
  });
});

describe('цена возвращается данными', () => {
  const priced: Plan = { id: 'x', name: 'Про', volume: 'до 20 000', priceRub: 69_000, features: [] };

  it('указанная цена печатается числом', () => {
    const { value, period } = planPrice(priced);
    // toLocaleString ставит неразрывный пробел — сравниваем по обычному.
    expect(value.replace(/[\s\u00a0\u202f]/g, ' ')).toBe('69 000 ₽');
    expect(period).toBe('в год');
  });

  it('план без цены остаётся «по договорённости»', () => {
    expect(planPrice({ ...priced, priceRub: null }).value).toBe('По договорённости');
  });

  it('появление цены включает разметку предложения для поисковиков', () => {
    expect(hasPublicPrices([priced])).toBe(true);
    expect(hasPublicPrices([{ ...priced, priceRub: null }])).toBe(false);
  });

  it('сетка раскладывается под число пакетов', () => {
    expect(planGridClass(1)).not.toMatch(/grid-cols/);
    expect(planGridClass(2)).toContain('lg:grid-cols-2');
    expect(planGridClass(3)).toContain('lg:grid-cols-3');
  });
});
