import { describe, expect, it } from 'vitest';
import { amountKopecks, recommend, TARIFFS } from './logic';

/**
 * Подбор тарифа — единственное место квиза, где ошибка стоит денег:
 * из него берётся сумма счёта. Проверяется отдельно от разметки.
 */
describe('подбор тарифа', () => {
  it('без объёма ничего не советует', () => {
    expect(recommend({})).toBeNull();
  });

  it('ведёт по объёму', () => {
    expect(recommend({ volume: 'to5k', payer: 'company' })?.tariff.id).toBe('start');
    expect(recommend({ volume: 'to20k', payer: 'company' })?.tariff.id).toBe('pro');
    expect(recommend({ volume: 'to60k', payer: 'company' })?.tariff.id).toBe('max');
    expect(recommend({ volume: 'more', payer: 'company' })?.tariff.id).toBe('enterprise');
  });

  it('поднимает до «Про», если участники забирают документы сами', () => {
    const r = recommend({ volume: 'to5k', delivery: 'selfService', payer: 'company' });
    expect(r?.tariff.id).toBe('pro');
    expect(r?.reasons.join(' ')).toContain('форму');
  });

  it('поднимает до «Про» ради своего домена и выдачи по API', () => {
    expect(recommend({ volume: 'to5k', sender: 'ourDomain', payer: 'company' })?.tariff.id).toBe('pro');
    expect(recommend({ volume: 'to5k', delivery: 'api', payer: 'company' })?.tariff.id).toBe('pro');
  });

  it('не понижает тариф из-за дополнительных ответов', () => {
    const r = recommend({
      volume: 'to60k',
      delivery: 'selfService',
      sender: 'ourDomain',
      payer: 'company',
    });
    expect(r?.tariff.id).toBe('max');
  });

  it('частному лицу предлагает оплату за документ, а не подписку', () => {
    const r = recommend({ volume: 'to5k', payer: 'person', sender: 'ourDomain' });
    expect(r?.tariff.id).toBe('payg');
    expect(r?.reasons[0]).toContain('частного лица');
  });

  it('частному лицу с большим объёмом честно советует написать', () => {
    const r = recommend({ volume: 'more', payer: 'person' });
    expect(r?.tariff.id).toBe('payg');
    expect(r?.reasons.join(' ')).toContain('выгоднее подписка');
  });

  it('объясняет каждое своё решение', () => {
    const r = recommend({ volume: 'to5k', delivery: 'api', sender: 'ourDomain', payer: 'company' });
    expect(r?.reasons.length).toBeGreaterThanOrEqual(2);
    expect(r?.reasons.every((x) => x.length > 10)).toBe(true);
  });

  it('считает сумму в копейках и не даёт её там, где цены нет', () => {
    expect(amountKopecks(TARIFFS.pro)).toBe(6_900_000);
    expect(amountKopecks(TARIFFS.enterprise)).toBeNull();
    expect(amountKopecks(TARIFFS.payg)).toBeNull();
  });
});
