import { PrismaService } from '../../../src/prisma/prisma.service';
import { testConfig } from '../../../src/config/env.test-utils';
import type { Env } from '../../../src/config/env';
import type { StorageService } from '../../../src/storage/storage.service';
import { DocumentsService } from '../../../src/documents/documents.service';
import { GenerationProcessor } from '../../../src/generation/generation.processor';
import { GenerationService } from '../../../src/generation/generation.service';
import { PdfRenderer } from '../../../src/generation/pdf-renderer';
import { MailProcessor } from '../../../src/mail/mail.processor';
import { MailService } from '../../../src/mail/mail.service';
import { SmtpProvider } from '../../../src/mail/smtp.provider';
import { MailingService } from '../../../src/mailing/mailing.service';
import { OrgService } from '../../../src/org/org.service';
import { RecipientsService } from '../../../src/recipients/recipients.service';
import { ReferralService } from '../../../src/referral/referral.service';
import { RegistryActionsService } from '../../../src/registry/registry-actions.service';
import { RegistryService } from '../../../src/registry/registry.service';
import { ReplacementService } from '../../../src/registry/replacement.service';
import { RenderController } from '../../../src/render/render.controller';
import { ValidationService } from '../../../src/validation/validation.service';
import { VerifyController } from '../../../src/verify/verify.controller';
import { MemoryStorage } from './storage';
import { startRenderPage, type RenderPage } from './render-page';

/**
 * Боевые службы, собранные руками, с настоящей базой за спиной.
 *
 * Через `Test.createTestingModule` собрать не получается: контейнер Nest
 * читает типы конструкторов из `design:paramtypes`, а эту разметку кладёт
 * `tsc`. Vitest собирает через esbuild, который её не умеет вовсе, — все
 * зависимости приходят пустыми. Ставить ради этого ещё один сборщик
 * в зависимости мы не стали: связи и так видны здесь целиком, в одном
 * месте, и подмену в них не спрячешь.
 *
 * Подменено ровно одно — объектное хранилище (см. `storage.ts`).
 * Prisma настоящая везде: в этом весь смысл слоя.
 */
export interface Services {
  prisma: PrismaService;
  storage: MemoryStorage;

  documents: DocumentsService;
  recipients: RecipientsService;
  validation: ValidationService;
  generation: GenerationService;
  processor: GenerationProcessor;
  renderer: PdfRenderer;
  registry: RegistryService;
  registryActions: RegistryActionsService;
  replacement: ReplacementService;
  mail: MailService;
  mailing: MailingService;
  verify: VerifyController;
  render: RenderController;
}

export interface IntegrationApp extends Services {
  close(): Promise<void>;
}

export interface AppOptions {
  /**
   * Обрабатывать ли задания выпуска в этом процессе.
   *
   * Выпуску воркер нужен — это и есть проверяемый путь. Остальным тестам
   * он только мешает: они смотрят на состояние заданий, а воркер меняет
   * его под руками.
   */
  worker?: boolean;
  /** Настройки поверх умолчаний — предел бесплатной пробы и подобное. */
  env?: Partial<Record<keyof Env, string>>;
}

export async function startApp(options: AppOptions = {}): Promise<IntegrationApp> {
  const worker = options.worker ?? false;

  // Страница печати поднимается первой: её адрес нужен PdfRenderer в момент
  // создания, а сама она обращается к контроллеру, которого ещё нет.
  const page: RenderPage = await startRenderPage();

  const config = testConfig({
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    RUN_WORKER: worker ? 'true' : 'false',
    RENDER_BASE_URL: page.url,
    // Локально Playwright ходит в системный Chrome, в конвейере — во
    // встроенный. Значение приходит из окружения, как и на боевом сервере.
    PLAYWRIGHT_CHANNEL: process.env.PLAYWRIGHT_CHANNEL ?? '',
    ...options.env,
  }) as never;

  const prisma = new PrismaService();
  await prisma.onModuleInit();

  const storage = new MemoryStorage();
  const asStorage = storage as unknown as StorageService;

  const referral = new ReferralService(prisma, config);
  const org = new OrgService(prisma, referral, config);
  const renderer = new PdfRenderer(config);
  const generation = new GenerationService(prisma, referral, config);
  const processor = new GenerationProcessor(prisma, asStorage, config, renderer, generation);
  const replacement = new ReplacementService(prisma);
  const mail = new MailService(prisma, asStorage, new SmtpProvider(config), config);
  const mailProcessor = new MailProcessor(mail, config);
  const registryActions = new RegistryActionsService(
    prisma,
    replacement,
    referral,
    processor,
    mail,
    mailProcessor,
    config,
  );

  const render = new RenderController(prisma, asStorage, config);
  page.use(render);

  /*
   * Очередь выпуска поднимается только там, где выпуск и проверяется.
   *
   * Почтовый воркер не поднимается нигде: без `onModuleInit` его `enqueue`
   * ничего не делает — письмо остаётся в базе, а на SMTP никто не ходит.
   * Проверять здесь надо решение «слать или не слать», а не почтовый шлюз,
   * которого в конвейере всё равно нет.
   */
  if (worker) processor.onModuleInit();

  return {
    prisma,
    storage,
    documents: new DocumentsService(prisma, asStorage),
    recipients: new RecipientsService(prisma),
    validation: new ValidationService(prisma, org),
    generation,
    processor,
    renderer,
    registry: new RegistryService(prisma, replacement),
    registryActions,
    replacement,
    mail,
    mailing: new MailingService(prisma, mail, mailProcessor, config),
    verify: new VerifyController(prisma, replacement),
    render,

    close: async () => {
      if (worker) await processor.onModuleDestroy();
      await mailProcessor.onModuleDestroy();
      await renderer.close();
      await page.close();
      await prisma.onModuleDestroy();
    },
  };
}
