import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { hashPassword, validatePasswordStrength } from './auth/password';

/**
 * Разовые команды обслуживания.
 *
 * Отдельно от prisma/seed.ts: тот запускается через tsx, которого в рабочем
 * образе нет и быть не должно. Этот файл компилируется вместе с приложением,
 * поэтому доступен на сервере:
 *
 *   docker compose -f docker-compose.prod.yml run --rm \
 *     -e OWNER_EMAIL=... -e OWNER_PASSWORD=... -e ORG_NAME='...' \
 *     api node dist/cli.js create-owner
 *
 * Пароль передаётся переменной окружения, а не аргументом: аргументы видны
 * в списке процессов любому пользователю сервера.
 */

const prisma = new PrismaClient();

async function createOwner(): Promise<void> {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;
  const orgName = process.env.ORG_NAME?.trim();

  if (!email || !password || !orgName) {
    throw new Error('Задайте OWNER_EMAIL, OWNER_PASSWORD и ORG_NAME');
  }
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(`Пароль слишком простой: ${weak}`);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Пользователь ${email} уже есть — ничего не меняю.`);
    return;
  }

  // Организация из консоли заводится оператором, а не саморегистрацией:
  // тариф оплаченный (лимит бесплатной пробы к ней не относится), адрес
  // считается подтверждённым — его ввёл сам оператор, проверять нечего.
  // Иначе оператор запер бы сам себя: письмо с подтверждением ему пришлось
  // бы ждать от почты, которая на этом шаге ещё не настроена.
  const org = await prisma.organization.create({ data: { name: orgName, plan: 'paid' } });
  await prisma.user.create({
    data: {
      email,
      name: process.env.OWNER_NAME ?? '',
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
      memberships: { create: { orgId: org.id, role: 'owner' } },
    },
  });
  console.log(`Создана организация «${org.name}», владелец ${email}`);
}

/** Проверка связности: база, Redis и хранилище отвечают. */
async function checkConnections(): Promise<void> {
  await prisma.$queryRaw`select 1`;
  console.log('база: отвечает');
}

const commands: Record<string, () => Promise<void>> = {
  'create-owner': createOwner,
  check: checkConnections,
};

const command = process.argv[2];
const run = commands[command];

if (!run) {
  console.error(`Неизвестная команда «${command ?? ''}». Доступны: ${Object.keys(commands).join(', ')}`);
  process.exitCode = 1;
} else {
  run()
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
