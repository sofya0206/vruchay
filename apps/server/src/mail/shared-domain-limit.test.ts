import { describe, expect, it } from 'vitest';
import { sharedDomainRefusal } from './shared-domain-limit';

/*
 * Ограничение объёма с общего домена.
 *
 * Смысл проверок — граница между «не мешаем работать» и «не даём испортить
 * репутацию всем». Ошибка в первую сторону останавливает награждение
 * у человека, который ничего дурного не сделал; во вторую — отдаёт
 * доставляемость всех заказчиков в руки одного.
 */

const limits = { perDay: 500, perBatch: 300 };

describe('обычная работа проходит свободно', () => {
  it('награждение на полсотни человек', () => {
    expect(sharedDomainRefusal({ sentToday: 0, adding: 50 }, limits)).toBeNull();
  });

  it('крупное соревнование на три сотни', () => {
    expect(sharedDomainRefusal({ sentToday: 0, adding: 300 }, limits)).toBeNull();
  });

  it('несколько награждений за день в пределах суточного объёма', () => {
    expect(sharedDomainRefusal({ sentToday: 200, adding: 300 }, limits)).toBeNull();
  });
});

describe('останавливаем то, на что сервис не рассчитан', () => {
  it('разом больше, чем за один раз положено', () => {
    const refusal = sharedDomainRefusal({ sentToday: 0, adding: 301 }, limits);
    expect(refusal).toMatch(/не больше 300 писем/);
  });

  it('за сутки набежало больше положенного', () => {
    const refusal = sharedDomainRefusal({ sentToday: 450, adding: 100 }, limits);
    expect(refusal).toMatch(/осталось 50/);
  });

  it('не уходит в минус, когда уже перебрали', () => {
    const refusal = sharedDomainRefusal({ sentToday: 600, adding: 10 }, limits);
    expect(refusal).toMatch(/осталось 0/);
  });
});

describe('в отказе есть выход, а не только запрет', () => {
  it('оба сообщения зовут подключить свой домен', () => {
    // Человек не сделал ничего дурного, а его награждение встало.
    // Отказ обязан объяснить, что делать дальше.
    const batch = sharedDomainRefusal({ sentToday: 0, adding: 400 }, limits);
    const daily = sharedDomainRefusal({ sentToday: 500, adding: 10 }, limits);
    expect(batch).toMatch(/свой домен/);
    expect(daily).toMatch(/свой домен/);
  });
});
