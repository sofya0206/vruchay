import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { AuditActor } from '../audit/actor.decorator';
import { AuditService, type Actor } from '../audit/audit.service';
import { RateLimitService } from '../common/rate-limit.service';
import { MailingService } from './mailing.service';
import {
  letterKindSchema,
  logQuerySchema,
  resendSchema,
  sendSchema,
  statsQuerySchema,
  templateSchema,
  testSendSchema,
  textMailingSchema,
  textRecipientsSchema,
  type SendDto,
  type TemplateDto,
  type TextMailingDto,
} from './mailing.dto';
import { TextMailingService } from './text-mailing.service';
import { MailStatsService } from './mail-stats.service';
import { resolvePeriod } from './mail-stats';
import { LETTER_KIND_LABELS } from './letter-kind';
import { PlanFeatureGuard, RequiresFeature } from '../plans/plan-feature.guard';

const uuidParam = new ZodValidationPipe(uuidSchema);

const audienceSchema = z.strictObject({
  documentId: z.string().uuid(),
  kind: letterKindSchema,
  source: z.enum(['table', 'manual']),
  emails: z.string().max(60_000).optional(),
});

/**
 * Раздел «Рассылка».
 *
 * Отдельно от материалов и от библиотеки писем: разослать документы —
 * самостоятельная работа, а не продолжение правки макета.
 */
@Controller('mailing')
@UseGuards(AuthGuard, PlanFeatureGuard)
export class MailingController {
  constructor(
    private readonly mailing: MailingService,
    private readonly texts: TextMailingService,
    private readonly mailStats: MailStatsService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('templates/:documentId')
  getTemplate(
    @CurrentUser() user: SessionUser,
    @Param('documentId', uuidParam) documentId: string,
    @Query('kind', new ZodValidationPipe(letterKindSchema)) kind: 'transactional' | 'marketing',
  ) {
    return this.mailing.getTemplate(user.orgId, documentId, kind);
  }

  @Post('templates/:documentId')
  saveTemplate(
    @CurrentUser() user: SessionUser,
    @Param('documentId', uuidParam) documentId: string,
    @Body(new ZodValidationPipe(templateSchema)) dto: TemplateDto,
  ) {
    return this.mailing.saveTemplate(user.orgId, documentId, dto);
  }

  /** Кому уйдёт и кому не уйдёт — до отправки, тем же расчётом. */
  @Post('audience')
  audience(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(audienceSchema)) dto: z.infer<typeof audienceSchema>,
  ) {
    return this.mailing.audience(user.orgId, dto.documentId, {
      kind: dto.kind,
      source: dto.source,
      emails: dto.emails,
    });
  }

  @RequiresFeature('mailing')
  @Post('send')
  async send(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Body(new ZodValidationPipe(sendSchema)) dto: SendDto,
  ) {
    const result = await this.mailing.send(user.orgId, dto);

    // Рассылка необратима: отправленное письмо не отзывается. Журнал
    // обязан помнить, кто её запустил, каким потоком и по каким материалам.
    await this.audit.record({
      actor,
      action: 'mailing.send',
      summary: `Рассылка (${LETTER_KIND_LABELS[dto.kind]}): писем ${result.queued}`,
      targetType: 'mailing',
      meta: {
        kind: dto.kind,
        source: dto.source,
        documents: result.results.map((r) => ({ id: r.documentId, queued: r.queued })),
      },
    });

    return result;
  }

  /**
   * Проверочное письмо себе.
   *
   * Ограничение частоты не от злоумышленника, а от нетерпения: кнопку
   * жмут по три раза, не дождавшись письма, и общий домен получает
   * всплеск отправок на ровном месте.
   */
  @RequiresFeature('mailing')
  @Post('test')
  async test(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(testSendSchema)) dto: z.infer<typeof testSendSchema>,
  ) {
    await this.limitTests(user.orgId);
    return this.mailing.testSend(user.orgId, user.email, dto.documentId, dto.kind);
  }

  private async limitTests(orgId: string) {
    const limit = await this.rateLimit.hit(`mailing-test:${orgId}`, 60_000, 5);
    if (!limit.allowed) {
      throw new BadRequestException(
        `Слишком часто. Подождите ${limit.retryAfterSeconds} секунд и попробуйте снова`,
      );
    }
  }

  @Get('log')
  log(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(logQuerySchema)) query: z.infer<typeof logQuerySchema>,
  ) {
    return this.mailing.log(user.orgId, query);
  }

  @RequiresFeature('mailing')
  @Post('resend')
  async resend(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Body(new ZodValidationPipe(resendSchema)) dto: z.infer<typeof resendSchema>,
  ) {
    const result = await this.mailing.resendFailed(user.orgId, dto.documentId);

    await this.audit.record({
      actor,
      action: 'mailing.resend',
      summary: `Повторная отправка недоставленных: ${result.queued}`,
      targetType: 'document',
      targetId: dto.documentId,
      meta: { queued: result.queued, skipped: result.skipped.length },
    });

    return result;
  }

  // ─── Сводка ──────────────────────────────────────────────────────────────

  /** Отправлено, доставлено, прочитано, не дошло — по дням и по источникам. */
  @Get('stats')
  stats(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(statsQuerySchema)) query: z.infer<typeof statsQuerySchema>,
  ) {
    const period = resolvePeriod(query);
    if ('error' in period) throw new BadRequestException(period.error);
    return this.mailStats.stats(user.orgId, period);
  }

  // ─── Рассылка без документа ──────────────────────────────────────────────

  @Post('text')
  createText(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(textMailingSchema)) dto: TextMailingDto,
  ) {
    return this.texts.create(user.orgId, dto);
  }

  @Get('text/:id')
  getText(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.texts.get(user.orgId, id);
  }

  @Patch('text/:id')
  updateText(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(textMailingSchema)) dto: TextMailingDto,
  ) {
    return this.texts.update(user.orgId, id, dto);
  }

  @Post('text/:id/audience')
  textAudience(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(textRecipientsSchema)) dto: z.infer<typeof textRecipientsSchema>,
  ) {
    return this.texts.audience(user.orgId, id, dto.emails);
  }

  @RequiresFeature('mailing')
  @Post('text/:id/test')
  async textTest(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    await this.limitTests(user.orgId);
    return this.texts.testSend(user.orgId, user.email, id);
  }

  @RequiresFeature('mailing')
  @Post('text/:id/send')
  async textSend(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(textRecipientsSchema)) dto: z.infer<typeof textRecipientsSchema>,
  ) {
    const result = await this.texts.send(user.orgId, id, dto.emails);

    await this.audit.record({
      actor,
      action: 'mailing.send',
      summary: `Рассылка «${result.name}»: писем ${result.queued}`,
      targetType: 'mailing',
      targetId: id,
      meta: { source: 'text', queued: result.queued, skipped: result.skipped.length },
    });

    return result;
  }
}
