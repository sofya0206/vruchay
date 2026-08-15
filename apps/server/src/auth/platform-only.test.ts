import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PlatformOnlyGuard } from './platform-only.guard';

/*
 * Доступ к счетам и заявкам — к нашей собственной кухне.
 *
 * До этой проверки там стояла роль «владелец», а владелец есть у каждой
 * организации: любой зарегистрировавшийся читал всю клиентскую книгу
 * сервиса. Тесты держат границу, чтобы она не разъехалась обратно.
 */

const PLATFORM = '11111111-1111-1111-1111-111111111111';
const CLIENT = '22222222-2222-2222-2222-222222222222';

function check(user: Record<string, unknown> | undefined, platformOrgId = PLATFORM) {
  const guard = new PlatformOnlyGuard({ get: () => platformOrgId } as never);
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ currentUser: user }) }),
  };
  return () => guard.canActivate(ctx as never);
}

describe('пускаем', () => {
  it('владельца нашей организации', () => {
    expect(check({ orgId: PLATFORM, role: 'owner' })()).toBe(true);
  });

  it('управляющего нашей организации', () => {
    expect(check({ orgId: PLATFORM, role: 'admin' })()).toBe(true);
  });
});

describe('не пускаем', () => {
  it('владельца чужой организации', () => {
    // Ровно то, ради чего проверка и заведена.
    expect(check({ orgId: CLIENT, role: 'owner' })).toThrow(ForbiddenException);
  });

  it('обычного сотрудника нашей организации', () => {
    expect(check({ orgId: PLATFORM, role: 'member' })).toThrow(ForbiddenException);
  });

  it('токен API даже с нашими правами', () => {
    // Счета — это деньги, отмечать их оплаченными должен человек.
    expect(check({ orgId: PLATFORM, role: 'owner', viaToken: true })).toThrow(ForbiddenException);
  });

  it('никого, если своя организация не задана', () => {
    // Закрыто по умолчанию: потерять на время свой список счетов
    // неприятно, отдать его посторонним — хуже.
    expect(check({ orgId: PLATFORM, role: 'owner' }, '')).toThrow(ForbiddenException);
  });

  it('запрос без пользователя', () => {
    expect(check(undefined)).toThrow(ForbiddenException);
  });
});
