import { Injectable } from '@nestjs/common';
import type { OnboardingEvent } from '@gramota/shared';
import { PrismaService } from '../prisma/prisma.service';
import { mskDay } from '../analytics/activation';

/**
 * Счётчики обучения: сколько раз показали, прошли и закрыли каждый слайд
 * и каждую точку — по дням, без людей и организаций (152-ФЗ). Нужны
 * одному вопросу: на каком экране бросают.
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /** День — московский, как у остальной аналитики. */
  async record(events: OnboardingEvent[], now = new Date()): Promise<void> {
    const day = new Date(`${mskDay(now)}T00:00:00.000Z`);
    await this.prisma.$transaction(
      events.map((e) =>
        this.prisma.onboardingStat.upsert({
          where: { day_flow_step_action: { day, flow: e.flow, step: e.step, action: e.action } },
          create: { day, flow: e.flow, step: e.step, action: e.action, count: 1 },
          update: { count: { increment: 1 } },
        }),
      ),
    );
  }

  /** Сводка за последние дни — для владельца сервиса, по всем сразу. */
  async dropOff(days = 30, now = new Date()) {
    const since = new Date(now.getTime() - days * 86_400_000);
    const grouped = await this.prisma.onboardingStat.groupBy({
      by: ['flow', 'step', 'action'],
      where: { day: { gte: since } },
      _sum: { count: true },
    });
    return {
      days,
      rows: grouped.map((g) => ({ flow: g.flow, step: g.step, action: g.action, count: g._sum.count ?? 0 })),
    };
  }
}
