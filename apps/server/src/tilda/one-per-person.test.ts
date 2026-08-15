import { describe, expect, it } from 'vitest';
import { submitSchema } from './tilda.dto';

/*
 * Однократная выдача.
 *
 * Проверка по адресу доставки обходится за пять секунд: вписал другую
 * почту — получил второй сертификат. Поэтому вместе с ней ищем и по
 * адресу учётной записи, который человек не набирал, а подставил
 * личный кабинет площадки.
 *
 * Здесь проверяется разбор запроса; сама выборка «уже выдавали?»
 * стоит в TildaService, а последним рубежом — два частичных уникальных
 * индекса в базе (по адресу доставки и по учётной записи).
 */

const valid = {
  token: '11111111-1111-4111-8111-111111111111',
  documentId: '22222222-2222-4222-8222-222222222222',
  email: 'Uchastnik@Mail.RU',
  consent: true as const,
};

function parse(extra: Record<string, unknown> = {}) {
  const result = submitSchema.safeParse({ ...valid, ...extra });
  if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join('; '));
  return result.data;
}

describe('адрес учётной записи', () => {
  it('приводится к нижнему регистру — иначе две записи вместо одной', () => {
    // Индекс в базе построен по lower(account_email). Если бы разбор
    // регистр не трогал, «Ivan@…» и «ivan@…» дали бы два сертификата
    // на одного человека.
    expect(parse({ accountEmail: 'Ivan@Example.RU' }).accountEmail).toBe('ivan@example.ru');
  });

  it('без него заявка проходит — площадка могла ничего не сообщить', () => {
    expect(parse().accountEmail).toBeUndefined();
  });

  it('мусор отбрасывается, но заявку не рубит', () => {
    // Поле служебное, человек о нём не знает. Отказать ему из-за того,
    // что площадка прислала ерунду, — наказание не по адресу.
    expect(parse({ accountEmail: 'не-адрес' }).accountEmail).toBeUndefined();
    expect(parse({ accountEmail: '' }).accountEmail).toBeUndefined();
  });

  it('адрес доставки по-прежнему обязателен и тоже нормализуется', () => {
    expect(parse().email).toBe('uchastnik@mail.ru');
  });

  it('адрес доставки и адрес учётной записи — разные поля', () => {
    // В этом весь смысл: человеку можно разрешить прислать документ
    // на другую почту, не открывая при этом дорогу второму сертификату.
    const data = parse({ email: 'drugaya@mail.ru', accountEmail: 'uchastnik@mail.ru' });
    expect(data.email).toBe('drugaya@mail.ru');
    expect(data.accountEmail).toBe('uchastnik@mail.ru');
  });
});
