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
   * Отправитель служебных писем самого сервиса: подтверждение адреса при
   * регистрации и подобное. Отдельно от отправителей организаций, и это
   * принципиально: у только что зарегистрировавшейся организации нет ни
   * домена, ни подтверждённого отправителя — а письмо ей выслать надо
   * именно сейчас. Такие письма всегда уходят с нашего домена.
   */
  SERVICE_MAIL_FROM: z.string().default('Вручай <noreply@vruchay.ru>'),

  /**
   * Отправитель писем участникам для организаций, которые ещё не подключили
   * свой домен: адрес наш, а имя в письме — название организации.
   *
   * Отделён от SERVICE_MAIL_FROM намеренно, хотя по умолчанию берётся из него.
   * Это разные роли, и однажды их захочется развести по адресам: жалоба
   * на рассылку документов не должна бить по письмам восстановления доступа.
   */
  PLATFORM_MAIL_FROM: z.string().optional(),

  /**
   * Сколько документов можно выпустить на бесплатной пробе. Ровно это число
   * обещано на посадочной странице — меняя его здесь, поменяйте и там.
   */
  FREE_DOCUMENT_LIMIT: z.coerce.number().int().positive().default(50),

  /**
   * Кому верить, когда он называет адрес посетителя в X-Forwarded-For.
   *
   * Значение по умолчанию — готовые наборы библиотеки proxy-addr: петля,
   * link-local и частные диапазоны (10/8, 172.16/12, 192.168/16, fc00::/7).
   * Ровно в них и живёт наш Caddy. Пустая строка выключает доверие совсем —
   * это правильное значение, если API однажды окажется открыт напрямую.
   */
  TRUST_PROXY: z.string().default('loopback, linklocal, uniquelocal'),

  /**
   * Куда писать, когда что-то сломалось у нас самих: не снялась резервная
   * копия, отвалилось хранилище. Не адрес поддержки для клиентов — адрес
   * того, кто пойдёт чинить.
   *
   * Пусто — тревоги остаются в журнале сервера. Это рабочее состояние
   * для разработки и негодное для боевого сервера.
   */
  ALERT_EMAIL: z.string().default(''),

  /**
   * Идентификатор организации, которая владеет сервисом, — нашей.
   *
   * Только её сотрудники видят счета и заявки с посадочной: это наша
   * бухгалтерия и наши будущие клиенты, а не данные организаций-клиентов.
   * Роль «владелец» для этого не годится — владелец есть у каждой
   * организации, а регистрация открыта всем.
   *
   * Пусто — разделы закрыты для всех. Так и задумано: потерять на время
   * доступ к своему списку счетов неприятно, отдать его посторонним хуже.
   */
  PLATFORM_ORG_ID: z.string().default(''),

  /**
   * Секрет в адресе для уведомлений почтового провайдера:
   * https://vruchay.ru/api/v1/mail/webhook/<секрет>
   *
   * Пусто — приём выключен, адрес отвечает «не найдено». Это правильное
   * значение по умолчанию: ручка меняет состояния писем, и открывать её
   * до настройки нельзя. Значение: openssl rand -hex 32
   */
  MAIL_WEBHOOK_SECRET: z.string().default(''),

  /**
   * Бакет с копиями базы. Тот же, что в /etc/vruchay-backup.env.
   * Приложение в него не пишет — только смотрит, лежит ли там свежий файл.
   */
  BACKUP_S3_BUCKET: z.string().default(''),

  /**
   * Приглашение друга. Награда — сами документы, а не деньги: денежная
   * премия притягивает тех, кому нужна премия, а не сервис, и превращает
   * рекомендацию коллеге в продажу. Документы же достаются нам почти
   * даром и втягивают обе стороны в работу.
   *
   * Бонус двусторонний. Односторонний ставит человека в положение, когда
   * он зовёт знакомого ради собственной выгоды; двусторонний позволяет
   * звать, потому что другому будет лучше.
   */
  REFERRAL_WELCOME_BONUS: z.coerce.number().int().min(0).default(50),
  REFERRAL_REWARD: z.coerce.number().int().min(0).default(50),
  /**
   * Сколько документов должен выпустить приглашённый, чтобы пригласивший
   * получил бонус. Ноль означал бы, что достаточно завести пустую
   * организацию на свободный ящик — и бонусы печатались бы из воздуха.
   */
  REFERRAL_QUALIFY_DOCUMENTS: z.coerce.number().int().min(1).default(10),
  /** Потолок начислений: за сотню приглашённых мы платить не подписывались. */
  REFERRAL_MAX_REWARDED: z.coerce.number().int().min(1).default(20),

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
