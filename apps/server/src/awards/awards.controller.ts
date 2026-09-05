import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { AwardsService } from './awards.service';
import {
  attachRuleSetSchema,
  AttachRuleSetDto,
  createRuleSetSchema,
  CreateRuleSetDto,
  previewSchema,
  PreviewDto,
  suggestSchema,
  SuggestDto,
  updateRuleSetSchema,
  UpdateRuleSetDto,
} from './awards.dto';
import { PlanFeatureGuard, RequiresFeature } from '../plans/plan-feature.guard';

const uuidParam = new ZodValidationPipe(uuidSchema);

/**
 * Наборы правил принадлежат организации, а не соревнованию: федерация
 * настраивает награждение один раз на сезон и применяет к каждому
 * следующему протоколу.
 */
@Controller('award-rules')
@UseGuards(AuthGuard, PlanFeatureGuard)
export class AwardRulesController {
  constructor(private readonly awards: AwardsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.awards.list(user.orgId);
  }

  /** Документы, из которых можно выбрать шаблон в конструкторе. */
  @Get('templates')
  templates(@CurrentUser() user: SessionUser) {
    return this.awards.templates(user.orgId);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.awards.get(user.orgId, id);
  }

  @RequiresFeature('awards')
  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createRuleSetSchema)) dto: CreateRuleSetDto,
  ) {
    return this.awards.create(user.orgId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(updateRuleSetSchema)) dto: UpdateRuleSetDto,
  ) {
    return this.awards.update(user.orgId, id, dto);
  }

  @RequiresFeature('awards')
  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.awards.duplicate(user.orgId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.awards.remove(user.orgId, id);
  }
}

/** Всё, что относится к конкретному соревнованию: привязка и раскладка. */
@Controller('documents/:id/awards')
@UseGuards(AuthGuard, PlanFeatureGuard)
export class DocumentAwardsController {
  constructor(private readonly awards: AwardsService) {}

  @RequiresFeature('awards')
  @Post('rule-set')
  attach(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(attachRuleSetSchema)) dto: AttachRuleSetDto,
  ) {
    return this.awards.attach(user.orgId, id, dto.ruleSetId);
  }

  /**
   * Превью раскладки. POST, а не GET: тело может содержать несохранённый
   * набор — человек правит правила и хочет видеть результат, не сохраняя
   * черновик в базу.
   */
  @Post('preview')
  preview(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(previewSchema)) dto: PreviewDto,
  ) {
    return this.awards.preview(user.orgId, id, dto.ruleSet);
  }

  /** Заготовка правил по колонкам загруженной таблицы. Ничего не сохраняет. */
  @Post('suggest')
  suggest(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(suggestSchema)) dto: SuggestDto,
  ) {
    return this.awards.suggest(user.orgId, id, dto.name);
  }
}
