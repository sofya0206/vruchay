import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PasswordResetService } from './password-reset.service';
import { verifyPassword } from './password';

/*
 * Восстановление забытого пароля.
 *
 * Ручка отдаёт доступ к учётной записи по ссылке из письма, поэтому
 * проверяется то, что решает: одноразовость ссылки, отказ неподтверждённым
 * адресам, молчание о том, есть ли такой человек в сервисе, и то, что
 * пароль в базу попадает хешем, а не как есть.
 */

interface Case {
  user?: { id: string; emailVerifiedAt: Date | null };
  /** Что лежит в Redis по ключу — идентификатор пользователя или ничего. */
  stored?: string | null;
}

function serviceWith({ user, stored = null }: Case) {
  const sent: { to: string; subject: string; html: string }[] = [];
  const redis = {
    store: new Map<string, string>(),
    async set(key: string, value: string) {
      this.store.set(key, value);
      return 'OK';
    },
    async get(key: string) {
      return this.store.has(key) ? this.store.get(key)! : stored;
    },
    async del(key: string) {
      this.store.delete(key);
      return 1;
    },
  };

  const updated: { passwordHash?: string } = {};
  const prisma = {
    user: {
      findUnique: async () => user ?? null,
      update: async ({ data }: { data: { passwordHash: string } }) => {
        updated.passwordHash = data.passwordHash;
        return {
          id: 'u1',
          email: 'trener@example.ru',
          name: 'Мария',
          memberships: [{ orgId: 'org1', role: 'owner' }],
        };
      },
    },
  };

  const mail = {
    sendService: async (to: string, subject: string, html: string) => {
      sent.push({ to, subject, html });
    },
  };

  const svc = new PasswordResetService(prisma as never, mail as never, redis as never);
  return { svc, sent, redis, updated };
}

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

describe('запрос ссылки', () => {
  it('незнакомому адресу письмо не уходит, но и ошибки нет', async () => {
    // Иначе форма «забыли пароль» становится способом проверять,
    // кто зарегистрирован в сервисе.
    const { svc, sent } = serviceWith({ user: undefined });
    await expect(svc.request('chuzhoy@example.ru')).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it('неподтверждённому адресу тоже не уходит', async () => {
    // Сбросить пароль на ящик, который ещё не доказал, что он его, —
    // значит отдать учётную запись тому, кто просто угадал адрес.
    const { svc, sent } = serviceWith({ user: { id: 'u1', emailVerifiedAt: null } });
    await svc.request('trener@example.ru');
    expect(sent).toHaveLength(0);
  });

  it('подтверждённому уходит письмо со ссылкой', async () => {
    const { svc, sent } = serviceWith({ user: { id: 'u1', emailVerifiedAt: new Date() } });
    await svc.request('trener@example.ru');

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('восстановление пароля');
    expect(sent[0].html).toContain('/reset?token=');
    // Человеку надо понимать, что делать, если он письма не просил.
    expect(sent[0].html).toContain('не просили');
  });

  it('в хранилище кладётся хеш, а не сама ссылка', async () => {
    // Содержимое Redis утекает легче, чем содержимое письма,
    // и по хешу ссылку не восстановить.
    const { svc, sent, redis } = serviceWith({ user: { id: 'u1', emailVerifiedAt: new Date() } });
    await svc.request('trener@example.ru');

    const token = /token=([^"&\s]+)/.exec(sent[0].html)![1];
    const keys = [...redis.store.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe('reset:' + hash(decodeURIComponent(token)));
    expect(keys[0]).not.toContain(decodeURIComponent(token));
  });

  it('ошибка отправки не роняет запрос — человек попробует ещё раз', async () => {
    const { svc } = serviceWith({ user: { id: 'u1', emailVerifiedAt: new Date() } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).mail = { sendService: vi.fn().mockRejectedValue(new Error('почта легла')) };
    await expect(svc.request('trener@example.ru')).resolves.toBeUndefined();
  });
});

describe('смена пароля по ссылке', () => {
  it('простой пароль отклоняется до всякой работы с базой', async () => {
    const { svc, updated } = serviceWith({ stored: 'u1' });
    await expect(svc.reset('токен-подлиннее-десяти', '123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updated.passwordHash).toBeUndefined();
  });

  it('устаревшая или чужая ссылка не срабатывает', async () => {
    const { svc } = serviceWith({ stored: null });
    await expect(svc.reset('несуществующий-токен', 'HoroshiyParol2026')).rejects.toThrow(
      /устарела/,
    );
  });

  it('пароль сохраняется хешем, а не как есть', async () => {
    const { svc, updated } = serviceWith({ stored: 'u1' });
    await svc.reset('токен-подлиннее-десяти', 'HoroshiyParol2026');

    expect(updated.passwordHash).toBeDefined();
    expect(updated.passwordHash).not.toContain('HoroshiyParol2026');
    await expect(verifyPassword(updated.passwordHash!, 'HoroshiyParol2026')).resolves.toBe(true);
  });

  it('при успехе отдаёт данные сессии — человек попадает в кабинет сразу', async () => {
    const { svc } = serviceWith({ stored: 'u1' });
    const session = await svc.reset('токен-подлиннее-десяти', 'HoroshiyParol2026');

    expect(session).toMatchObject({ orgId: 'org1', role: 'owner', email: 'trener@example.ru' });
  });
});
