import { describe, expect, it } from 'vitest';
import { parseMailFrom } from './platform-sender';

/*
 * Отправитель на нашем домене — единственное, что стоит между организацией
 * без своего домена и работающей выдачей документов. Ошибка в разборе строки
 * означает не отказ, а письма с испорченного адреса: они уйдут в спам,
 * и никто не поймёт почему.
 */

describe('parseMailFrom', () => {
  it('разбирает «Имя <адрес>»', () => {
    expect(parseMailFrom('Вручай <noreply@vruchay.ru>')).toEqual({
      email: 'noreply@vruchay.ru',
      name: 'Вручай',
    });
  });

  it('разбирает голый адрес', () => {
    expect(parseMailFrom('noreply@vruchay.ru')).toEqual({
      email: 'noreply@vruchay.ru',
      name: 'Вручай',
    });
  });

  it('снимает кавычки с имени', () => {
    expect(parseMailFrom('"Вручай" <noreply@vruchay.ru>')?.name).toBe('Вручай');
  });

  it('не спотыкается о лишние пробелы', () => {
    expect(parseMailFrom('  Вручай   <  noreply@vruchay.ru  >  ')).toEqual({
      email: 'noreply@vruchay.ru',
      name: 'Вручай',
    });
  });

  it('на пустом значении возвращает null, а не пустой адрес', () => {
    // Лучше честный отказ отправить, чем письмо с адреса «undefined@».
    expect(parseMailFrom(undefined)).toBeNull();
    expect(parseMailFrom('')).toBeNull();
    expect(parseMailFrom('   ')).toBeNull();
  });

  it('отвергает значение без похожего на адрес', () => {
    expect(parseMailFrom('Вручай')).toBeNull();
    expect(parseMailFrom('noreply@localhost')).toBeNull();
    expect(parseMailFrom('Вручай <не адрес>')).toBeNull();
  });
});
