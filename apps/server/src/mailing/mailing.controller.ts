import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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
  templateSchema,
  testSendSchema,
  type SendDto,
  type TemplateDto,
} from './mailing.dto';
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
    const limit = await this.rateLimit.hit(`mailing-test:${user.orgId}`, 60_000, 5);
    if (!limit.allowed) {
      throw new BadRequestException(
        `Слишком часто. Подождите ${limit.retryAfterSeconds} секунд и попробуйте снова`,
      );
    }
    return this.mailing.testSend(user.orgId, user.email, dto.documentId, dto.kind);
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
}
