import { z } from 'zod';

/**
 * Переменные окружения проверяются один раз при старте — сервер падает сразу,
 * а не через час в фоновой задаче из-за пустого ключа S3.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  /** Публичный домен сервиса: попадает в ссылки верификации и в письма */
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),

  /**
   * Адрес, по которому воркер открывает страницу печати.
   *
   * Отдельно от публичного намеренно: обращение контейнера к собственному
   * внешнему адресу — это заворот трафика на себя, и у облачных провайдеров
   * он то работает, то нет. Внутри сети docker сосед доступен по имени,
   * без TLS, DNS и внешнего маршрута. Пусто — берётся PUBLIC_URL
   * (так работает разработка, где всё на одной машине).
   */
  RENDER_BASE_URL: z.string().url().optional(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  /**
   * Секрет для шифрования cookie-сессии. Минимум 32 символа: из него
   * выводится 32-байтный ключ. Значение только из окружения, в код не попадает.
   */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET должен быть не короче 32 символов'),

  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default('ru-1'),

  /** Обрабатывать ли задания генерации в этом процессе. В проде воркер — отдельный контейнер. */
  RUN_WORKER: z
    .union([z.boolean(), z.string()])
    .default(true)
    .transform((v) => v === true || v === 'true' || v === '1'),
  /**
   * Канал браузера для Playwright. Пусто — встроенный Chromium из образа,
   * 'chrome' — системный Google Chrome (так работает локальная разработка,
   * где загрузка встроенного Chromium недоступна).
   */
  PLAYWRIGHT_CHANNEL: z.string().default(''),

  /** Почта. Локально — Mailpit на 1025 без авторизации. */
  MAIL_PROVIDER: z.enum(['smtp', 'dashamail']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .union([z.boolean(), z.string()])
    .default(false)
    .transform((v) => v === true || v === 'true' || v === '1'),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_SPF_INCLUDE: z.string().default('vruchay.ru'),
  DASHAMAIL_API_KEY: z.string().default(''),

  /**
   * Реквизиты продавца для счетов. В файле с реквизитами они лежать не могут:
   * тот файл не попадает в репозиторий и на сервер не едет.
   */
  /** ЮKassa: пока пусто — приём платежей выключен, остальной сервис работает. */
  YOOKASSA_SHOP_ID: z.string().default(''),
  YOOKASSA_SECRET_KEY: z.string().default(''),

  SELLER_NAME: z.string().default(''),
  SELLER_INN: z.string().default(''),
  SELLER_OGRNIP: z.string().default(''),
  SELLER_ADDRESS: z.string().default(''),
  SELLER_ACCOUNT: z.string().default(''),
  SELLER_BANK: z.string().default(''),
  SELLER_BIK: z.string().default(''),
  SELLER_CORR_ACCOUNT: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Некорректные переменные окружения:\n${details}`);
  }
  return parsed.data;
}
