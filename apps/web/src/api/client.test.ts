import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';

/*
 * Заголовок типа содержимого при пустом теле — не мелочь оформления.
 * Fastify отвечает на такой запрос 400, и разом отваливаются все действия
 * без тела: удаление документа, строки, колонки, домена, интеграции,
 * проверка домена, отметка счёта оплаченным. Проверялось руками, ошибка
 * прожила до первой живой проверки — потому что внешне выглядела как
 * «кнопка ничего не делает».
 */

function mockFetch(status = 200, body: unknown = { ok: true }) {
  const spy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function headersOf(spy: ReturnType<typeof mockFetch>): Record<string, string> {
  return (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
}

afterEach(() => vi.unstubAllGlobals());

describe('тип содержимого', () => {
  it('не ставится у DELETE — тела нет', () => {
    const spy = mockFetch();
    void api.delete('/documents/x');
    expect(headersOf(spy)['content-type']).toBeUndefined();
  });

  it('не ставится у POST без тела', () => {
    const spy = mockFetch();
    void api.post('/mail/domains/x/check');
    expect(headersOf(spy)['content-type']).toBeUndefined();
  });

  it('ставится, когда тело есть', () => {
    const spy = mockFetch();
    void api.post('/documents', { title: 'Грамота' });
    expect(headersOf(spy)['content-type']).toBe('application/json');
  });

  it('ставится и для пустого объекта — он тоже тело', () => {
    const spy = mockFetch();
    void api.post('/documents/x/duplicate', {});
    expect(headersOf(spy)['content-type']).toBe('application/json');
    expect((spy.mock.calls[0][1] as RequestInit).body).toBe('{}');
  });

  it('не ставится при загрузке файла — его задаёт браузер вместе с границей', () => {
    const spy = mockFetch();
    void api.upload('/documents/x/background', new File(['a'], 'bg.png'));
    expect(headersOf(spy)['content-type']).toBeUndefined();
  });
});

describe('ошибки', () => {
  it('поднимает сообщение сервера', async () => {
    mockFetch(400, { message: 'Документ не найден' });
    await expect(api.delete('/documents/x')).rejects.toThrow('Документ не найден');
  });
});
