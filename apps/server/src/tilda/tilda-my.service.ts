import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type IORedis from 'ioredis';
import { InjectRedis } from '../common/redis.module';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';
import { maskEmail } from '../common/redact';
import { isOriginAllowed } from './origin';
import { OtpService } from './otp.service';

/**
 * «Мои документы»: всё, что человеку выдавали через формы организации.
 *
 * Список открывается только после подтверждения адреса кодом — всегда,
 * независимо от режима интеграции. Выдача одного документа без кода —
 * риск, который организатор вправе принять; а вот перечень всех документов
 * по чужому адресу — это уже раскрытие того, где человек участвовал.
 *
 * Сеанс просмотра живёт в Redis, как и коды: он временный и переживать
 * перезапуск не должен.
 */

/** Сколько ждём кода. */
const PENDING_TTL = 10 * 60;
/** Сколько открыт список после подтверждения — и ссылки на скачивание в нём. */
const OPEN_TTL = 60 * 60;
/** Больше сотни документов на один адрес — не участник, а организатор. */
const MAX_ITEMS = 100;

interface Session {
  orgId: string;
  integrationId: string;
  email: string;
  accountEmail: string;
  confirmed: '0' | '1';
}

export interface MyDocument {
  requestId: string;
  title: string;
  issuedAt: string;
}

@Injectable()
export class TildaMyService {
  private readonly logger = new Logger(TildaMyService.name);

  constructor(
    @InjectRedis() private readonly redis: IORedis,
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
  ) {}

  private key(listId: string): string {
    return `my:${listId}`;
  }

  async start(
    dto: { token: string; email: string; accountEmail?: string },
    ctx: { origin?: string; referer?: string },
  ): Promise<{ status: 'need_code'; listId: string }> {
    const integration = await this.prisma.tildaIntegration.findUnique({
      where: { token: dto.token },
      select: { id: true, orgId: true, active: true, allowedDomains: true },
    });
    if (!integration || !integration.active) {
      throw new BadRequestException('Не удалось открыть список');
    }
    if (!isOriginAllowed(ctx.origin, ctx.referer, integration.allowedDomains)) {
      this.logger.warn(`Список: источник «${ctx.origin ?? ctx.referer ?? 'не указан'}» не разрешён`);
      throw new BadRequestException('Не удалось открыть список');
    }

    const listId = randomUUID();
    const session: Session = {
      orgId: integration.orgId,
      integrationId: integration.id,
      email: dto.email,
      accountEmail: dto.accountEmail ?? '',
      confirmed: '0',
    };
    await this.redis
      .multi()
      .hset(this.key(listId), session)
      .expire(this.key(listId), PENDING_TTL)
      .exec();

    const code = await this.otp.issue(this.key(listId));
    await this.mail.sendCode(integration.orgId, dto.email, code);
    this.logger.log(`Список запрошен для ${maskEmail(dto.email)}`);

    return { status: 'need_code', listId };
  }

  async confirm(listId: string, code: string): Promise<{ items: MyDocument[] }> {
    const session = await this.session(listId);
    if (session.confirmed === '1') return this.list(listId);

    const result = await this.otp.verify(this.key(listId), code);
    if (result === 'ok') {
      await this.redis
        .multi()
        .hset(this.key(listId), { confirmed: '1' })
        .expire(this.key(listId), OPEN_TTL)
        .exec();
      return this.list(listId);
    }
    if (result === 'blocked') {
      await this.redis.del(this.key(listId));
      throw new BadRequestException('Слишком много неверных попыток. Запросите список заново');
    }
    throw new BadRequestException(result === 'expired' ? 'Срок действия кода истёк' : 'Неверный код');
  }

  async list(listId: string): Promise<{ items: MyDocument[] }> {
    const session = await this.session(listId);
    if (session.confirmed !== '1') throw new NotFoundException('Список не подтверждён');

    const requests = await this.prisma.tildaRequest.findMany({
      where: this.ownedBy(session),
      orderBy: { doneAt: 'desc' },
      take: MAX_ITEMS,
      select: { id: true, documentId: true, doneAt: true },
    });

    const documents = await this.prisma.document.findMany({
      where: { id: { in: requests.map((r) => r.documentId) } },
      select: { id: true, title: true },
    });
    const titles = new Map(documents.map((d) => [d.id, d.title]));

    return {
      items: requests.map((r) => ({
        requestId: r.id,
        title: titles.get(r.documentId) ?? 'Документ',
        issuedAt: (r.doneAt ?? new Date()).toISOString(),
      })),
    };
  }

  /**
   * Скачивание из списка.
   *
   * Не через обычный маршрут скачивания: тот открыт час после выдачи,
   * а здесь человек приходит за документом полугодовой давности.
   * Вместо окна по времени выдачи — окно сеанса: список подтверждён
   * кодом и живёт час, столько же живут и ссылки в нём.
   */
  async download(listId: string, requestId: string) {
    const session = await this.session(listId);
    if (session.confirmed !== '1') throw new NotFoundException('Документ недоступен');

    const request = await this.prisma.tildaRequest.findFirst({
      where: { id: requestId, ...this.ownedBy(session) },
      select: { fileId: true },
    });
    if (!request?.fileId) throw new NotFoundException('Документ недоступен');

    const file = await this.prisma.file.findFirst({
      where: { id: request.fileId, deletedAt: null },
      select: { s3Key: true, mime: true, originalName: true },
    });
    if (!file) throw new NotFoundException('Документ недоступен');

    return {
      stream: await this.storage.getStream(file.s3Key),
      filename: file.originalName || 'Документ.pdf',
      mime: file.mime,
    };
  }

  /** Выданные документы этого человека в этой организации. */
  private ownedBy(session: Session) {
    const emails = [session.email, session.accountEmail].filter(Boolean);
    return {
      orgId: session.orgId,
      status: 'done' as const,
      fileId: { not: null },
      OR: [{ email: { in: emails } }, { accountEmail: { in: emails } }],
    };
  }

  private async session(listId: string): Promise<Session> {
    const stored = await this.redis.hgetall(this.key(listId));
    if (!stored.orgId) throw new NotFoundException('Список не найден или устарел');
    return stored as unknown as Session;
  }
}
