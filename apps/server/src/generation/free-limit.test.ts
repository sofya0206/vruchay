import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { GenerationService } from './generation.service';

/*
 * Лимит бесплатной пробы. Проверяем именно арифметику границы: ошибка здесь
 * либо пускает мимо кассы, либо останавливает награждение на середине,
 * и оба исхода замечает не разработчик, а клиент.
 *
 * Prisma подменяем минимальной заглушкой: нужны ровно два запроса —
 * организация и число выпущенных файлов.
 */

interface Stub {
  plan: 'free' | 'paid';
  used: number;
  /** Документы, заработанные приглашениями. По умолчанию никто никого не звал. */
  bonus?: number;
}

function serviceWith({ plan, used, bonus = 0 }: Stub): GenerationService {
  const prisma = {
    organization: { findUnique: async () => ({ id: 'org', plan }) },
    file: { count: async () => used },
  };
  const referral = { bonusDocuments: async () => bonus };
  const config = { get: () => 3 };
  return new GenerationService(prisma as never, referral as never, config as never);
}

/** Проверка приватная — вызываем через тот же путь, что и приложение. */
function check(svc: GenerationService, adding: number): Promise<void> {
  return (svc as unknown as { checkFreeLimit(o: string, n: number): Promise<void> }).checkFreeLimit(
    'org',
    adding,
  );
}

const LIMIT = 50;

describe('лимит бесплатной пробы', () => {
  beforeEach(() => {
    process.env.FREE_DOCUMENT_LIMIT = String(LIMIT);
  });
  afterEach(() => {
    delete process.env.FREE_DOCUMENT_LIMIT;
  });

  it('на оплаченном тарифе не ограничивает ничего', async () => {
    await expect(check(serviceWith({ plan: 'paid', used: 100_000 }), 5_000)).resolves.toBeUndefined();
  });

  it('пропускает, когда ровно упирается в лимит', async () => {
    // 40 выпущено + 10 отмечено = ровно 50. Это разрешено: обещано
    // «первые 50», а не «первые 49».
    await expect(check(serviceWith({ plan: 'free', used: 40 }), 10)).resolves.toBeUndefined();
  });

  it('отказывает, когда превышение на один документ', async () => {
    await expect(check(serviceWith({ plan: 'free', used: 40 }), 11)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('в отказе называет, сколько осталось и сколько отмечено', async () => {
    await expect(check(serviceWith({ plan: 'free', used: 45 }), 10)).rejects.toThrow(
      /осталось 5 .*а отмечено 10/,
    );
  });

  it('при исчерпанном лимите говорит об этом прямо, а не «осталось 0»', async () => {
    await expect(check(serviceWith({ plan: 'free', used: 50 }), 1)).rejects.toThrow(
      /проба закончилась/,
    );
  });

  it('не уходит в минус, если выпущено больше лимита', async () => {
    // Так бывает после перевода организации с оплаченного тарифа обратно.
    await expect(check(serviceWith({ plan: 'free', used: 80 }), 1)).rejects.toThrow(
      /проба закончилась/,
    );
  });

  it('заработанное приглашениями прибавляется к пробе', async () => {
    // 50 базовых + 50 за приглашённого друга. Выпущено 60 — раньше это был бы
    // отказ, а с бонусом человек продолжает работать.
    await expect(
      check(serviceWith({ plan: 'free', used: 60, bonus: 50 }), 10),
    ).resolves.toBeUndefined();
  });

  it('в отказе называет лимит уже вместе с бонусом', async () => {
    await expect(check(serviceWith({ plan: 'free', used: 95, bonus: 50 }), 10)).rejects.toThrow(
      /осталось 5 документов из 100/,
    );
  });

  it('при исчерпанной пробе подсказывает про приглашение друга', async () => {
    await expect(check(serviceWith({ plan: 'free', used: 50 }), 1)).rejects.toThrow(
      /Пригласить друга/,
    );
  });
});
