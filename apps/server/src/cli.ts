import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { PLAN_FEATURE_KEYS, PLAN_PERIOD_KEYS, isPlanFeature } from '@gramota/shared';
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

/**
 * Назначить организации план — второй способ, помимо защищённого эндпоинта.
 *
 * Нужен ровно там, где кабинет недоступен: сервер поднят, клиент ждёт,
 * а войти под своей организацией платформы некуда. Значения передаются
 * переменными окружения, а не аргументами: аргументы видны в списке
 * процессов любому пользователю сервера.
 *
 *   docker compose -f docker-compose.prod.yml run --rm \
 *     -e ORG_ID=... -e PLAN_NAME='500 документов на год' \
 *     -e PLAN_LIMIT=500 -e PLAN_PERIOD=year -e PLAN_ENDS_AT=2027-08-29 \
 *     api node dist/cli.js assign-plan
 */
async function assignPlan(): Promise<void> {
  const orgId = process.env.ORG_ID?.trim();
  const name = process.env.PLAN_NAME?.trim();
  const limit = Number(process.env.PLAN_LIMIT);
  const period = (process.env.PLAN_PERIOD ?? 'package').trim();

  if (!orgId || !name) throw new Error('Задайте ORG_ID и PLAN_NAME');
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('PLAN_LIMIT — целое число документов больше нуля');
  }
  if (!(PLAN_PERIOD_KEYS as string[]).includes(period)) {
    throw new Error(`PLAN_PERIOD — одно из: ${PLAN_PERIOD_KEYS.join(', ')}`);
  }

  const startsAt = process.env.PLAN_STARTS_AT ? new Date(process.env.PLAN_STARTS_AT) : new Date();
  const endsAt = process.env.PLAN_ENDS_AT ? new Date(process.env.PLAN_ENDS_AT) : null;
  if (Number.isNaN(startsAt.getTime())) throw new Error('PLAN_STARTS_AT — не дата');
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error('PLAN_ENDS_AT — не дата');
  if (endsAt && endsAt <= startsAt) throw new Error('PLAN_ENDS_AT раньше начала плана');

  // По умолчанию входит всё: ограничение — решение переговоров, и принимать
  // его должен человек, а не забытая переменная окружения.
  const features = (process.env.PLAN_FEATURES ?? PLAN_FEATURE_KEYS.join(','))
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  const unknown = features.filter((f) => !isPlanFeature(f));
  if (unknown.length > 0) {
    throw new Error(
      `Неизвестные возможности: ${unknown.join(', ')}. Доступны: ${PLAN_FEATURE_KEYS.join(', ')}`,
    );
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  if (!org) throw new Error('Организация не найдена');

  const plan = await prisma.plan.create({
    data: {
      orgId,
      name,
      documentLimit: limit,
      period: period as 'package' | 'year',
      startsAt,
      endsAt,
      features,
      neverExpires: process.env.PLAN_NEVER_EXPIRES === 'true',
      note: process.env.PLAN_NOTE?.trim() || null,
      assignedBy: process.env.PLAN_ASSIGNED_BY?.trim() || 'cli',
    },
  });
  // Старая колонка тарифа осталась у половины кабинета: без этого рядом
  // с назначенным планом писалось бы «у вас бесплатная проба».
  await prisma.organization.update({ where: { id: orgId }, data: { plan: 'paid' } });

  console.log(
    `Организации «${org.name}» назначен план «${plan.name}»: ` +
      `${plan.documentLimit} документов, ${plan.period === 'year' ? 'год' : 'разовый пакет'}` +
      `${endsAt ? `, до ${endsAt.toISOString().slice(0, 10)}` : ''}`,
  );
}

/** Проверка связности: база, Redis и хранилище отвечают. */
async function checkConnections(): Promise<void> {
  await prisma.$queryRaw`select 1`;
  console.log('база: отвечает');
}

const commands: Record<string, () => Promise<void>> = {
  'create-owner': createOwner,
  'assign-plan': assignPlan,
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
