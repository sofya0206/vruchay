import { describe, expect, it } from 'vitest';
import { movedViewTarget } from './moved-views';

const ID = '8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a';

/*
 * Старые адреса вкладок редактора разошлись по закладкам и письмам.
 * Показать по ним макет вместо списка — потерять человека молча,
 * поэтому перевод старого адреса в новый проверяем поимённо.
 */
describe('старые вкладки редактора', () => {
  it('получатели ведут в рабочее место материала', () => {
    expect(movedViewTarget('table', ID)).toBe(`/mailing/${ID}`);
  });

  it('правила, проверка и письмо — на свои вкладки там же', () => {
    expect(movedViewTarget('rules', ID)).toBe(`/mailing/${ID}?tab=rules`);
    expect(movedViewTarget('check', ID)).toBe(`/mailing/${ID}?tab=check`);
    expect(movedViewTarget('mail', ID)).toBe(`/mailing/${ID}?tab=mail`);
  });

  it('выданное — в общий реестр, сразу отобранный по материалу', () => {
    expect(movedViewTarget('registry', ID)).toBe(`/registry?documentId=${ID}`);
  });

  it('макет никуда не ведёт: он и так здесь', () => {
    expect(movedViewTarget('editor', ID)).toBeNull();
    expect(movedViewTarget(null, ID)).toBeNull();
    expect(movedViewTarget('чтотоещё', ID)).toBeNull();
  });
});
