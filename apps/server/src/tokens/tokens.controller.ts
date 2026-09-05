import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { HumansOnlyGuard } from '../auth/humans-only.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { AuditActor } from '../audit/actor.decorator';
import { AuditService, type Actor } from '../audit/audit.service';
import { TokensService } from './tokens.service';
import { PlanFeatureGuard, RequiresFeature } from '../plans/plan-feature.guard';

const uuidParam = new ZodValidationPipe(uuidSchema);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Назовите токен — потом не разберётесь').max(100),
  role: z.enum(['member', 'admin']).default('member'),
});

/**
 * Токены для доступа к API.
 *
 * Заводит и отзывает только владелец или управляющий, и только человек:
 * токен, умеющий выдавать себе новые токены, — это бессрочный доступ,
 * который нельзя отозвать, потому что он тут же выдаст себе следующий.
 */
@Controller('tokens')
@UseGuards(AuthGuard, HumansOnlyGuard, RolesGuard, PlanFeatureGuard)
export class TokensController {
  constructor(
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Roles('owner', 'admin')
  list(@CurrentUser() user: SessionUser) {
    return this.tokens.list(user.orgId);
  }

  @RequiresFeature('api')
  @Post()
  @Roles('owner', 'admin')
  async create(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Body(new ZodValidationPipe(createSchema)) dto: z.infer<typeof createSchema>,
  ) {
    const created = await this.tokens.create({
      orgId: user.orgId,
      userId: user.userId,
      name: dto.name,
      role: dto.role,
    });

    await this.audit.record({
      actor,
      action: 'token.create',
      summary: `Выдан токен доступа «${dto.name}»`,
      targetType: 'token',
      targetId: created.id,
      meta: { role: dto.role },
    });

    // Единственный раз, когда токен покидает сервер целиком.
    return created;
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async revoke(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
  ) {
    const result = await this.tokens.revoke(user.orgId, id);
    await this.audit.record({
      actor,
      action: 'token.revoke',
      summary: `Отозван токен доступа «${result.name}»`,
      targetType: 'token',
      targetId: id,
    });
    return result;
  }
}
