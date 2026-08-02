import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function contextFor(role?: string): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ currentUser: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext;
}

function guard(required: string[] | undefined): RolesGuard {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('пропускает маршруты без требования роли', () => {
    expect(guard(undefined).canActivate(contextFor('member'))).toBe(true);
    expect(guard([]).canActivate(contextFor('member'))).toBe(true);
  });

  it('пропускает подходящую роль', () => {
    expect(guard(['owner', 'admin']).canActivate(contextFor('admin'))).toBe(true);
  });

  it('отклоняет недостаточную роль', () => {
    expect(() => guard(['owner', 'admin']).canActivate(contextFor('member'))).toThrow(
      /Недостаточно прав/,
    );
  });

  it('отклоняет запрос без роли — на случай обхода AuthGuard', () => {
    expect(() => guard(['owner']).canActivate(contextFor(undefined))).toThrow();
  });
});
