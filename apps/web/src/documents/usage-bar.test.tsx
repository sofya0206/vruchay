import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Usage } from '../api/org';

/*
 * Полоска остатка на стыке веток 10-A и 10-B.
 *
 * Две ветки переписали этот абзац независимо: A — состояния плана,
 * B — ссылку на форму заявки. Слияние обязано было сохранить оба,
 * и потерю любого из них глазами не видно: текст останется связным.
 * Поэтому здесь проверяется не вёрстка, а что из тупика есть выход
 * в каждом состоянии, где он нужен, и что его нет там, где он лишний.
 */

const usageMock = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('../api/org', () => ({ useUsage: () => usageMock }));

const { UsageBar } = await import('./UsageBar');

function show(u: Partial<Usage>) {
  usageMock.data = {
    plan: 'paid', planName: '500 документов на год', source: 'plan',
    used: 100, limit: 500, left: 400, bonus: 0, warn: 'none',
    endsAt: null, expired: false, neverExpires: false, features: [], ...u,
  };
  return renderToStaticMarkup(<MemoryRouter><UsageBar /></MemoryRouter>);
}

describe('остаток документов: состояния и выход из тупика', () => {
  it('состояния из A на месте', () => {
    expect(show({ expired: true, warn: 'expired' })).toContain('Срок плана закончился');
    expect(show({ left: 0, warn: 'exhausted' })).toContain('План израсходован');
    expect(show({ left: 0, warn: 'exhausted', source: 'trial' })).toContain('Проба закончилась');
    expect(show({ warn: 'low', left: 100 })).toContain('Осталось немного');
    expect(show({})).toContain('Черновики, правки макета');
    expect(show({})).toContain('500 документов на год');
  });

  it('ссылка на форму из B есть в каждом тупике', () => {
    for (const u of [
      { expired: true, warn: 'expired' as const },
      { left: 0, warn: 'exhausted' as const },
      { left: 0, warn: 'exhausted' as const, source: 'trial' as const },
      { warn: 'low' as const, left: 100 },
      { warn: 'critical' as const, left: 50 },
    ]) expect(show(u)).toContain('href="/#obsudit"');
  });

  it('пока запас велик — ссылки нет', () => {
    expect(show({})).not.toContain('/#obsudit');
  });
});
