import { describe, expect, it } from 'vitest';
import { MailService } from './mail.service';
import { testConfig } from '../config/env.test-utils';
import type { DnsRecord } from './mail-provider.interface';

/*
 * Домен, заявленный при SMTP, после переключения на DashaMail.
 *
 * Его записи новому провайдеру не годятся: у DashaMail свой ключ DKIM,
 * и домен ещё надо подключить к аккаунту. Проверка по старым записям
 * подтвердила бы домен, с которого DashaMail не отправит ни письма.
 */

const OLD: DnsRecord[] = [
  { type: 'TXT', host: '_vruchay-verify', value: 'vruchay-verify=tok', purpose: '' },
  { type: 'TXT', host: '@', value: 'v=spf1 include:vruchay.ru ~all', purpose: '' },
];
const NEW: DnsRecord[] = [
  OLD[0],
  { type: 'TXT', host: 'dm2._domainkey', value: 'v=DKIM1;p=KEY', purpose: '' },
];

function world(providerName: string) {
  const domain = {
    id: 'd1',
    orgId: 'org',
    domain: 'example.ru',
    provider: 'smtp',
    status: 'verified',
    verificationToken: 'tok',
    verifiedAt: new Date('2026-09-01'),
    dnsRecords: OLD,
  };
  const calls = { setup: [] as string[], checked: [] as DnsRecord[][] };
  let saved: Record<string, unknown> = {};

  const prisma = {
    mailDomain: {
      findFirst: async () => domain,
      update: async ({ data }: { data: Record<string, unknown> }) => (saved = data),
    },
  };
  const provider = {
    name: providerName,
    getDomainSetup: async (_d: string, token: string) => {
      calls.setup.push(token);
      return NEW;
    },
    checkDomain: async (_d: string, records: DnsRecord[]) => {
      calls.checked.push(records);
      return 'pending' as const;
    },
  };

  const service = new MailService(
    prisma as never,
    {} as never,
    provider as never,
    testConfig() as never,
  );
  return { service, calls, saved: () => saved };
}

describe('проверка домена после смены провайдера', () => {
  it('записи выдаются заново тем же токеном — подтверждение владения в силе', async () => {
    const { service, calls, saved } = world('dashamail');
    await service.checkDomain('org', 'd1');

    expect(calls.setup).toEqual(['tok']);
    expect(calls.checked).toEqual([NEW]);
    expect(saved()).toMatchObject({ provider: 'dashamail', dnsRecords: NEW, status: 'pending' });
  });

  it('тот же провайдер — записи прежние, заново ничего не выдаётся', async () => {
    const { service, calls, saved } = world('smtp');
    await service.checkDomain('org', 'd1');

    expect(calls.setup).toEqual([]);
    expect(calls.checked).toEqual([OLD]);
    expect(saved()).not.toHaveProperty('dnsRecords');
  });
});
