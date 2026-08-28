import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from '../auth/auth.service';
import { OverviewService } from './overview.service';

/**
 * Рабочий стол кабинета.
 *
 * Ни одного входящего параметра: организация берётся из сессии, и запросить
 * сводку по чужой невозможно — подставлять в этот адрес нечего.
 */
@Controller('overview')
@UseGuards(AuthGuard)
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  summary(@CurrentUser() user: SessionUser) {
    return this.overview.summary(user.orgId);
  }
}
