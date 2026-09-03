import { describe, expect, it } from 'vitest';
import { billingSchema } from './billing.dto';

const base = {
  name: 'ООО «Плавание»',
  inn: '7707083893',
  kpp: '',
  ogrn: '',
  address: 'Москва, ул. Правды, 1',
  email: 'buh@example.com',
};

function check(dto: Record<string, unknown>) {
  return billingSchema.safeParse(dto);
}

describe('реквизиты плательщика', () => {
  it('принимает юрлицо с ИНН из десяти цифр', () => {
    expect(check({ ...base, kind: 'legal' }).success).toBe(true);
  });

  it('не принимает у юрлица ИНН из двенадцати цифр', () => {
    const result = check({ ...base, kind: 'legal', inn: '770708389312' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('10 цифр');
  });

  it('у предпринимателя ИНН из двенадцати цифр', () => {
    expect(check({ ...base, kind: 'ie', inn: '770708389312' }).success).toBe(true);
    expect(check({ ...base, kind: 'ie', inn: '7707083893' }).success).toBe(false);
  });

  it('КПП бывает только у организации', () => {
    expect(check({ ...base, kind: 'legal', kpp: '770701001' }).success).toBe(true);
    expect(check({ ...base, kind: 'ie', inn: '770708389312', kpp: '770701001' }).success).toBe(
      false,
    );
  });

  it('КПП всегда из девяти цифр', () => {
    expect(check({ ...base, kind: 'legal', kpp: '7707010' }).success).toBe(false);
  });

  it('ОГРН у юрлица тринадцать цифр, у предпринимателя пятнадцать', () => {
    expect(check({ ...base, kind: 'legal', ogrn: '1027700132195' }).success).toBe(true);
    expect(check({ ...base, kind: 'legal', ogrn: '304500116000157' }).success).toBe(false);
    expect(
      check({ ...base, kind: 'ie', inn: '770708389312', ogrn: '304500116000157' }).success,
    ).toBe(true);
  });

  it('у самозанятого ОГРН не бывает', () => {
    expect(
      check({ ...base, kind: 'self_employed', inn: '770708389312', ogrn: '304500116000157' })
        .success,
    ).toBe(false);
  });

  it('физлицу ИНН не обязателен, остальным обязателен', () => {
    expect(check({ ...base, kind: 'individual', inn: '' }).success).toBe(true);
    expect(check({ ...base, kind: 'legal', inn: '' }).success).toBe(false);
  });

  it('адрес почты либо пустой, либо настоящий', () => {
    expect(check({ ...base, kind: 'legal', email: '' }).success).toBe(true);
    expect(check({ ...base, kind: 'legal', email: 'не почта' }).success).toBe(false);
  });

  it('неизвестный вид плательщика не проходит', () => {
    expect(check({ ...base, kind: 'ooo' }).success).toBe(false);
  });
});
