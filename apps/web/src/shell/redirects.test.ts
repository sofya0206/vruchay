import { describe, expect, it } from 'vitest';
import { legacyTarget } from './redirects';

const ID = '8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a';

/*
 * Таблица переезда адресов. Каждая строка — обещание: ссылка из письма
 * полугодовой давности открывает то же место, что и раньше.
 */
describe('старые адреса', () => {
  it.each([
    [`/mailing/${ID}`, '', `/documents/${ID}/recipients`],
    [`/mailing/${ID}`, '?tab=table', `/documents/${ID}/recipients`],
    [`/mailing/${ID}`, '?tab=rules', `/documents/${ID}/rules`],
    [`/mailing/${ID}`, '?tab=check', `/documents/${ID}/check`],
    [`/mailing/${ID}`, '?tab=mail', `/documents/${ID}/letter`],
    [`/mailing/${ID}`, '?tab=verify', `/documents/${ID}/issue`],
    [`/mailing/${ID}`, '?tab=чтото', `/documents/${ID}/recipients`],
    [`/documents/${ID}`, '?view=table', `/documents/${ID}/recipients`],
    [`/documents/${ID}`, '?view=mail', `/documents/${ID}/letter`],
    [`/documents/${ID}`, '?view=registry', `/registry?documentId=${ID}`],
    ['/mailing', '?list=undelivered', '/mailing?status=undelivered'],
    ['/mailing', '?list=stats', '/mailing/stats'],
    ['/mailing', '?list=new&mode=text', '/mailing/new?mode=text'],
    ['/mailing', '?list=lists', '/documents'],
    ['/analytics', '', '/registry?tab=analytics'],
    ['/billing', '', '/settings/billing'],
    ['/integrations', '', '/settings/integrations'],
    ['/integrations/tilda', '', '/settings/integrations'],
    ['/settings/support', '', '/support'],
    ['/settings/referral', '', '/referral'],
    ['/settings/domains', '', '/settings/mail'],
    ['/settings/senders', '', '/settings/mail'],
    ['/settings/privacy', '', '/settings/organization'],
    ['/settings/tokens', '', '/settings/integrations#api'],
  ])('%s%s → %s', (pathname, search, expected) => {
    expect(legacyTarget(pathname, search)).toBe(expected);
  });

  it('живые адреса не трогает', () => {
    expect(legacyTarget('/mailing', '')).toBeNull();
    expect(legacyTarget('/mailing', '?list=all')).toBeNull();
    expect(legacyTarget(`/documents/${ID}`, '')).toBeNull();
    expect(legacyTarget('/settings/account', '')).toBeNull();
    expect(legacyTarget('/registry', '?tab=analytics')).toBeNull();
  });
});
