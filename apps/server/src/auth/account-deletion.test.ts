import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AccountDeletionService } from './account-deletion.service';
import { hashPassword } from './password';

/** Членство человека в организации — то, из чего складываются препятствия. */
interface Membership {
  role: 'owner' | 'admin' | 'member';
  orgId: string;
  orgName: string;
  members: number;
  issued: number;
}

function serviceWith(memberships: Membership[]) {
  const deleted = { orgs: [] as string[], users: [] as string[] };

  const prisma = {
    user: {
      findUnique: async () => ({ passwordHash: hashedPassword, email: 'i@example.test' }),
      delete: async ({ where }: { where: { id: string } }) => void deleted.users.push(where.id),
    },
    orgMember: {
      findMany: async ({ where }: { where: { role?: string } }) => {
        const rows = memberships.map((m) => ({
          role: m.role,
          orgId: m.orgId,
          org: { name: m.orgName, _count: { members: m.members } },
        }));
        // Второй вызов ищет организации, где человек — единственный участник.
        if (where.role === 'owner') {
          return rows.filter(
            (r) => r.role === 'owner' && memberships.find((m) => m.orgId === r.orgId)!.members === 1,
          );
        }
        return rows;
      },
    },
    file: {
      count: async ({ where }: { where: { orgId: string } }) =>
        memberships.find((m) => m.orgId === where.orgId)?.issued ?? 0,
    },
    organization: {
      delete: async ({ where }: { where: { id: string } }) => void deleted.orgs.push(where.id),
    },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(prisma),
  };

  return { service: new AccountDeletionService(prisma as never), deleted };
}

// Хеш считаем один раз: argon2 намеренно медленный.
const hashedPassword = await hashPassword('верный-пароль');

const org = (over: Partial<Membership> = {}): Membership => ({
  role: 'owner',
  orgId: 'org-1',
  orgName: 'Федерация',
  members: 1,
  issued: 0,
  ...over,
});

describe('препятствия к удалению учётной записи', () => {
  it('владелец организации с сотрудниками — сначала передать организацию', async () => {
    const { service } = serviceWith([org({ members: 3 })]);
    const blockers = await service.blockers('user-1');
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain('Передайте организацию');
  });

  it('выданные документы держат удаление: их проверяют посторонние', async () => {
    const { service } = serviceWith([org({ issued: 47 })]);
    const blockers = await service.blockers('user-1');
    expect(blockers[0]).toContain('47');
    expect(blockers[0]).toContain('корзину');
  });

  it('рядовой сотрудник уходит свободно — организация остаётся с владельцем', async () => {
    const { service } = serviceWith([org({ role: 'member', members: 5, issued: 1000 })]);
    expect(await service.blockers('user-1')).toEqual([]);
  });

  it('пустая организация в одиночку препятствием не является', async () => {
    const { service } = serviceWith([org()]);
    expect(await service.blockers('user-1')).toEqual([]);
  });
});

describe('само удаление', () => {
  it('без верного пароля не удаляет ничего', async () => {
    const { service, deleted } = serviceWith([org()]);
    await expect(service.delete('user-1', 'не тот')).rejects.toBeInstanceOf(BadRequestException);
    expect(deleted).toEqual({ orgs: [], users: [] });
  });

  it('удаляет человека вместе с его пустой одиночной организацией', async () => {
    const { service, deleted } = serviceWith([org()]);
    await service.delete('user-1', 'верный-пароль');
    expect(deleted.users).toEqual(['user-1']);
    expect(deleted.orgs).toEqual(['org-1']);
  });

  it('организацию с коллегами не трогает даже при удалении', async () => {
    const { service, deleted } = serviceWith([org({ role: 'member', members: 4 })]);
    await service.delete('user-1', 'верный-пароль');
    expect(deleted.users).toEqual(['user-1']);
    expect(deleted.orgs).toEqual([]);
  });

  it('препятствие перепроверяется перед самим удалением, а не только на экране', async () => {
    // Между показом экрана и нажатием могли выпустить документы.
    const { service, deleted } = serviceWith([org({ issued: 1 })]);
    await expect(service.delete('user-1', 'верный-пароль')).rejects.toThrow(/корзину/);
    expect(deleted.users).toEqual([]);
  });
});
