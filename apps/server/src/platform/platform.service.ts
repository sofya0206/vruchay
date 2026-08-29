import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pickPlan, type PlanRecord } from '../plans/plan';

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Список организаций для владельца сервиса.
   *
   * Отдаём ровно то, что нужно для решения «переводить на тариф или нет»:
   * название, тариф, дату появления, сколько документов выпущено и кто
   * владелец. Содержимого организаций здесь нет и быть не должно.
   */
  async listOrganizations() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        name: true,
        plan: true,
        createdAt: true,
        members: {
          where: { role: 'owner' },
          take: 1,
          select: { user: { select: { email: true, name: true } } },
        },
        // Планы тянем связью, а не запросом на организацию: список
        // на сто клиентов иначе стоил бы сто запросов.
        plans: { orderBy: { startsAt: 'desc' } },
      },
    });
    if (orgs.length === 0) return [];

    // Число выпущенного — одним запросом на всех, а не по запросу
    // на организацию: иначе список на сто клиентов это сто запросов.
    const issued = await this.prisma.file.groupBy({
      by: ['orgId'],
      where: { kind: 'generated' },
      _count: { _all: true },
    });
    const counts = new Map(issued.map((i) => [i.orgId, i._count._all]));

    const now = new Date();
    return orgs.map((o) => {
      const current = pickPlan(o.plans as PlanRecord[], now);
      return {
        id: o.id,
        name: o.name,
        plan: o.plan,
        createdAt: o.createdAt,
        ownerEmail: o.members[0]?.user.email ?? '',
        ownerName: o.members[0]?.user.name ?? '',
        issued: counts.get(o.id) ?? 0,
        /** Действующий план — то, о чём с этим клиентом договорились. */
        currentPlan: current
          ? {
              id: current.id,
              name: current.name,
              documentLimit: current.documentLimit,
              period: current.period,
              startsAt: current.startsAt,
              endsAt: current.endsAt,
              neverExpires: current.neverExpires,
            }
          : null,
      };
    });
  }

  async setPlan(orgId: string, plan: 'free' | 'paid') {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    if (!org) throw new NotFoundException('Организация не найдена');

    await this.prisma.organization.update({ where: { id: orgId }, data: { plan } });
    this.logger.log(`Организация ${orgId} («${org.name}») переведена на тариф ${plan}`);

    return { ok: true as const, id: orgId, name: org.name, plan };
  }
}
