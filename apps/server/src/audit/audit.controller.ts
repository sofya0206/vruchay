import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { SessionUser } from '../auth/auth.service';
import { AuditService } from './audit.service';

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().trim().max(60).optional(),
});

/**
 * Журнал действий организации.
 *
 * Смотреть может владелец или управляющий: журнал показывает, кто из
 * сотрудников что сделал, и отдавать его всем подряд — значит превращать
 * рабочий инструмент в средство наблюдения друг за другом.
 */
@Controller('audit')
@UseGuards(AuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('owner', 'admin')
  list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>,
  ) {
    return this.audit.list(user.orgId, query);
  }
}
