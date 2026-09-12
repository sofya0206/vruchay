import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Metrics } from './Metrics';
import type { Overview } from '../api/overview';
import type { Usage, UsageWarn } from '../api/org';

/*
 * Предупреждение об остатке на рабочем столе.
 *
 * Цифра на этой плитке — та, по которой человек решает, хватит ли ему
 * на ближайшее награждение. Порог считает сервер: тот же, который решает,
 * пускать ли к выпуску. Разойдись они — на экране было бы «осталось 20»,
 * а выпуск отказал бы, и доверия к сервису не осталось.
 *
 * Словами о кончающемся остатке больше не предупреждаем — только цветом:
 * на главной цифры стоят вместо приветствия, и абзац объяснений под ними
 * съедал бы верх экрана каждый раз, когда запас пошёл на убыль. Строка
 * осталась одна — про истёкший срок, потому что этого цифра не покажет.
 */

function overview(usage: Partial<Usage>): Overview {
  return {
    usage: {
      plan: 'paid',
      planName: '500 документов на год',
      source: 'plan',
      used: 100,
      limit: 500,
      left: 400,
      bonus: 0,
      warn: 'none' as UsageWarn,
      endsAt: null,
      expired: false,
      neverExpires: false,
      features: ['mailing'],
      ...usage,
    },
    issuedTotal: 100,
    issuedMonth: 10,
    issuedPrevMonth: 4,
    emailsSent: 5,
    mail: { delivered: 4, undelivered: 0 },
    verifiedMonth: 2,
    verificationsTotal: 7,
    materials: 2,
    documents: [],
    jobs: [],
  };
}

// Плитки — ссылки в разделы, а ссылкам нужен маршрутизатор.
const html = (usage: Partial<Usage>) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <Metrics data={overview(usage)} />
    </MemoryRouter>,
  );

describe('плитка остатка', () => {
  it('на плане называет план, а не пробу', () => {
    const out = html({});
    expect(out).toContain('Осталось по плану');
    expect(out).not.toContain('Осталось на пробе');
  });

  it('пока запас велик — ни тревоги, ни лишних слов', () => {
    const out = html({ warn: 'none', left: 400 });
    expect(out).not.toContain('--danger');
    expect(out).not.toContain('Срок плана закончился');
  });

  it('на десяти процентах предупреждает цветом', () => {
    // Приёмка задания: «на 90% появляется предупреждение».
    const out = html({ warn: 'critical', left: 50 });
    expect(out).toContain('--danger');
  });

  it('после окончания срока обещает, что выданное осталось действительным', () => {
    // Это первый вопрос на переговорах, и ответ на него не должен
    // зависеть от того, дозвонился ли человек до нас.
    const out = html({ warn: 'expired', expired: true, left: 380 });
    expect(out).toContain('Срок плана закончился');
    expect(out).toContain('остаются действительными');
  });

  it('на бесплатной пробе говорит про пробу', () => {
    const out = html({
      source: 'trial',
      plan: 'free',
      planName: 'Бесплатная проба',
      limit: 100,
      left: 40,
      bonus: 50,
    });
    expect(out).toContain('Осталось на пробе');
  });

  it('там, где предела нет, считать нечего', () => {
    const out = html({ source: 'legacy-paid', limit: null, left: null });
    expect(out).toContain('∞');
  });
});
