import { describe, expect, it } from 'vitest';
import { parseMailWebhook } from './webhook-events';
import { advanceStatus } from './email-status';

/*
 * Разбор уведомлений провайдера и порядок состояний письма.
 *
 * Проверяем терпимость разбора (провайдеры называют одно и то же
 * по-разному) и, главное, что событие не отматывает письмо назад:
 * уведомления приходят не по порядку, и наивная запись ставила бы
 * «доставлено» тому, кто письмо уже прочёл.
 */

const REF = '3f7a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8';

describe('разбор уведомления', () => {
  it('одно событие объектом', () => {
    const events = parseMailWebhook({ reference: REF, event: 'delivered' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ reference: REF, type: 'delivered' });
  });

  it('пачка массивом', () => {
    const events = parseMailWebhook([
      { reference: REF, event: 'sent' },
      { reference: REF, event: 'delivered' },
    ]);
    expect(events.map((e) => e.type)).toEqual(['sent', 'delivered']);
  });

  it('пачка внутри поля', () => {
    const events = parseMailWebhook({ events: [{ custom_id: REF, status: 'open' }] });
    expect(events[0].type).toBe('opened');
  });

  it('понимает разные написания одного события', () => {
    const cases: Array<[string, string]> = [
      ['delivery', 'delivered'],
      ['open', 'opened'],
      ['hard_bounce', 'bounced'],
      ['spam', 'bounced'],
      ['complaint', 'bounced'],
      ['rejected', 'failed'],
      ['DELIVERED', 'delivered'],
      [' Opened ', 'opened'],
    ];
    for (const [given, expected] of cases) {
      expect(parseMailWebhook({ reference: REF, event: given })[0]?.type).toBe(expected);
    }
  });

  it('находит ссылку под разными именами полей', () => {
    for (const field of ['reference', 'custom_id', 'customId', 'message_id', 'X-Vruchay-Ref']) {
      expect(parseMailWebhook({ [field]: REF, event: 'delivered' })).toHaveLength(1);
    }
  });

  it('время берёт из секунд и из миллисекунд', () => {
    const seconds = parseMailWebhook({ reference: REF, event: 'sent', timestamp: 1_770_000_000 });
    const millis = parseMailWebhook({ reference: REF, event: 'sent', timestamp: 1_770_000_000_000 });
    expect(seconds[0].occurredAt.getTime()).toBe(1_770_000_000_000);
    expect(millis[0].occurredAt.getTime()).toBe(1_770_000_000_000);
  });
});

describe('тип события из адреса — как у DashaMail', () => {
  /*
   * В кабинете DashaMail отдельное поле адреса на каждое событие:
   * «Доставка», «Возвраты», «Жалоба на спам». В теле типа нет вовсе —
   * он определяется тем, куда постучались.
   */
  it('берёт тип из адреса, когда в теле его нет', () => {
    const events = parseMailWebhook({ reference: REF }, 'delivered');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('delivered');
  });

  it('тип из тела сильнее типа из адреса', () => {
    // Тело точнее, а провайдера мы собираемся менять.
    const events = parseMailWebhook({ reference: REF, event: 'bounce' }, 'delivered');
    expect(events[0].type).toBe('bounced');
  });

  it('без типа и в теле, и в адресе событие бесполезно', () => {
    expect(parseMailWebhook({ reference: REF })).toEqual([]);
  });
});

describe('когда своей ссылки в уведомлении нет', () => {
  /*
   * Мы кладём ссылку в заголовок отправляемого письма, а вернёт ли
   * провайдер чужой заголовок — его дело. Нужны запасные приметы.
   */
  it('запоминает идентификатор письма у провайдера', () => {
    const events = parseMailWebhook({ message_id: 'dm-8812345', email: 'a@b.ru' }, 'delivered');
    expect(events[0]).toMatchObject({
      reference: '',
      providerMessageId: 'dm-8812345',
      email: 'a@b.ru',
    });
  });

  it('запоминает адрес получателя и приводит его к нижнему регистру', () => {
    const events = parseMailWebhook({ email: 'Petr@Example.RU' }, 'bounced');
    expect(events[0].email).toBe('petr@example.ru');
  });

  it('своя ссылка сильнее запасных примет', () => {
    const events = parseMailWebhook(
      { reference: REF, message_id: 'dm-1', email: 'a@b.ru' },
      'delivered',
    );
    expect(events[0].reference).toBe(REF);
    expect(events[0].providerMessageId).toBeUndefined();
  });

  it('совсем без примет событие отбрасывается', () => {
    expect(parseMailWebhook({ статус: 'что-то' }, 'delivered')).toEqual([]);
  });
});

describe('что отбрасываем', () => {
  it('событие без нашей ссылки', () => {
    // Идентификатор провайдера нам не подходит: по нему письмо не найти.
    expect(parseMailWebhook({ provider_id: 'abc123', event: 'delivered' })).toEqual([]);
  });

  it('ссылку, которая не наш идентификатор', () => {
    expect(parseMailWebhook({ reference: 'не-uuid', event: 'delivered' })).toEqual([]);
  });

  it('незнакомое событие', () => {
    expect(parseMailWebhook({ reference: REF, event: 'unsubscribed' })).toEqual([]);
  });

  it('мусор вместо тела', () => {
    for (const body of [null, undefined, 'строка', 42, []]) {
      expect(parseMailWebhook(body)).toEqual([]);
    }
  });
});

describe('порядок состояний — только вперёд', () => {
  it('обычный путь', () => {
    expect(advanceStatus('queued', 'sent')).toBe('sent');
    expect(advanceStatus('sent', 'delivered')).toBe('delivered');
    expect(advanceStatus('delivered', 'opened')).toBe('opened');
  });

  it('запоздавшая доставка не затирает прочтение', () => {
    // Ровно та ошибка, ради которой заведён порядок: уведомления
    // приходят не по очереди.
    expect(advanceStatus('opened', 'delivered')).toBeNull();
    expect(advanceStatus('opened', 'sent')).toBeNull();
  });

  it('повтор того же события ничего не меняет', () => {
    // Провайдеры шлют повторы до подтверждения приёма.
    expect(advanceStatus('delivered', 'delivered')).toBeNull();
  });

  it('«не доставлено» не отменяется запоздавшим «отправлено»', () => {
    expect(advanceStatus('bounced', 'sent')).toBeNull();
    expect(advanceStatus('bounced', 'delivered')).toBeNull();
  });

  it('провал перекрывает любой успех', () => {
    expect(advanceStatus('opened', 'bounced')).toBe('bounced');
  });
});
