import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { TildaService } from './tilda.service';
import {
  integrationSchema,
  integrationPatchSchema,
  IntegrationDto,
  IntegrationPatchDto,
} from './tilda.dto';
import { PlanFeatureGuard, RequiresFeature } from '../plans/plan-feature.guard';

const uuidParam = new ZodValidationPipe(uuidSchema);
const listRequestsSchema = z.object({
  integrationId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
});
type ListRequestsDto = z.infer<typeof listRequestsSchema>;

/** Управление интеграциями из кабинета. Публичная часть — в отдельном контроллере. */
@Controller('integrations/tilda')
@UseGuards(AuthGuard, RolesGuard, PlanFeatureGuard)
export class TildaController {
  constructor(private readonly tilda: TildaService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.tilda.listIntegrations(user.orgId);
  }

  @Get('requests')
  listRequests(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(listRequestsSchema)) query: ListRequestsDto,
  ) {
    return this.tilda.listRequests(user.orgId, query.integrationId, query.documentId);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.tilda.getIntegration(user.orgId, id);
  }

  // Интеграция открывает выдачу документов посторонним людям, поэтому её
  // создание и настройка — право владельца и администратора, а не участника.
  @RequiresFeature('tilda')
  @Post()
  @Roles('owner', 'admin')
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(integrationSchema)) dto: IntegrationDto,
  ) {
    return this.tilda.createIntegration(user.orgId, dto);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(integrationPatchSchema)) dto: IntegrationPatchDto,
  ) {
    return this.tilda.updateIntegration(user.orgId, id, dto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  remove(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.tilda.deleteIntegration(user.orgId, id);
  }
}
