import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { PlatformOnlyGuard } from '../auth/platform-only.guard';
import { ThrottleGuard } from '../common/throttle.guard';
import { Throttle } from '../common/throttle.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from '../auth/auth.service';
import { MetricsService } from './metrics.service';
import { FunnelService } from './funnel.service';
import { DigestService } from './digest.service';
import { PERIODS, SummaryService } from './summary.service';

const summaryQuery = z.object({
  period: z.enum(PERIODS).default('30d'),
  documentId: z.string().uuid('Некорректный идентификатор материала').optional(),
});
type SummaryQuery = z.infer<typeof summaryQuery>;

/**
 * Раздел «Аналитика».
 *
 * Ни одного входящего параметра у сводки: организация берётся из сессии,
 * и запросить цифры по чужой невозможно — подставлять в этот адрес нечего.
 *
 * Воронка по всем организациям лежит здесь же, но за отдельной проверкой:
 * это наша кухня, а не данные клиента. Регистрация у сервиса открытая,
 * и без неё любой зарегистрировавшийся видел бы, как идут дела у всех.
 */
@Controller('analytics')
@UseGuards(AuthGuard, RolesGuard, ThrottleGuard)
export class AnalyticsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly funnel: FunnelService,
    private readonly digest: DigestService,
    private readonly periods: SummaryService,
  ) {}

  @Get()
  summary(@CurrentUser() user: SessionUser) {
    return this.metrics.forOrg(user.orgId);
  }

  /**
   * Сводка за период: плитки, графики по дням и разбивка по материалам.
   * Из входящего — только период и материал; материал всё равно
   * отбирается внутри своей организации.
   */
  @Get('summary')
  periodSummary(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(summaryQuery)) q: SummaryQuery) {
    return this.periods.forOrg(user.orgId, q.period, q.documentId);
  }

  @Get('funnel')
  @UseGuards(PlatformOnlyGuard)
  platformFunnel() {
    return this.funnel.platform();
  }

  /**
   * Прислать себе месячную сводку — ту самую, что первого числа уходит
   * владельцу. Нужна, чтобы проверить письмо, не дожидаясь первого числа.
   *
   * Адрес берётся из сессии и в теле запроса не принимается: иначе
   * это была бы отправка письма от нашего имени на любой ящик.
   * Частота ограничена: письмо уходит наружу, а кнопку можно нажимать
   * без счёта.
   */
  @Post('digest/preview')
  @Roles('owner', 'admin')
  @Throttle({ max: 5, timeWindow: '1 hour' })
  async digestPreview(@CurrentUser() user: SessionUser) {
    const numbers = await this.digest.preview(user.orgId, user.email);
    return { ok: true as const, ...numbers };
  }
}
