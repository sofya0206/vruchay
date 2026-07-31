/**
 * Создаёт первую организацию и владельца.
 * Пароль и почта берутся из окружения — в код и в репозиторий они не попадают:
 *   SEED_OWNER_EMAIL=... SEED_OWNER_PASSWORD=... pnpm --filter @gramota/server seed
 * Повторный запуск ничего не ломает: существующий пользователь не трогается.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword, validatePasswordStrength } from '../src/auth/password';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  const orgName = process.env.SEED_ORG_NAME ?? 'Моя организация';

  if (!email || !password) {
    throw new Error(
      'Задайте SEED_OWNER_EMAIL и SEED_OWNER_PASSWORD в окружении перед запуском seed',
    );
  }
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(`Пароль владельца слишком простой: ${weak}`);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Пользователь ${email} уже существует — ничего не меняю.`);
    return;
  }

  const org = await prisma.organization.create({ data: { name: orgName } });
  const user = await prisma.user.create({
    data: {
      email,
      name: process.env.SEED_OWNER_NAME ?? '',
      passwordHash: await hashPassword(password),
      memberships: { create: { orgId: org.id, role: 'owner' } },
    },
  });

  console.log(`Создана организация «${org.name}» и владелец ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
