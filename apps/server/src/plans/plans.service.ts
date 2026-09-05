import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlanFeature } from '@gramota/shared';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from '../referral/referral.service';
import {
  allows,
  legacyPaidQuota,
  pickPlan,
  planQuota,
  trialQuota,
  type PlanRecord,
  type Quota,
} from './plan';

/** Часть клиента Prisma, которой хватает и транзакции, и обычному вызову. */
export type PlanTxClient = Pick<PrismaService, 'organization' | 'file' | 'plan'>;

/** Что нужно знать, чтобы завести план. Проверено Zod на границе. */
export interface PlanInput {
  name: string;
  documentLimit: number;
  period: 'package' | 'year';
  startsAt: Date;
  endsAt: Date | null;
  features: PlanFeature[];
  neverExpires: boolean;
  note?: string | null;
}

/**
 * Единственное место, которое знает, что организации положено.
 *
 * Раньше это знание лежало в трёх местах сразу: выпуск, перевыпуск
 * и цифра на главной кабинета считали остаток каждый по-своему. Пока
 * условия были одни на всех — «проба на пятьдесят» — расхождение никого
 * не трогало. С планами по договорённости оно означало бы «в кабинете
 * осталось двадцать, а выпуск отказал», то есть потерянное доверие
 * ровно в тот момент, когда человек работает.
 */
@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly referral: ReferralService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Сколько организации положено и сколько осталось.
   *
   * Израсходованное считаем по файлам, а не отдельным счётчиком: счётчик
   * пришлось бы держать в согласии с реальностью при каждой ошибке,
   * отмене и удалении, а файлы и есть то, что человек получил.
   *
   * Клиент базы принимаем снаружи: проверка перед выпуском идёт под замком
   * организации и в своей транзакции, и заглядывать мимо неё нельзя —
   * иначе два окна кабинета увидят один и тот же остаток.
   */
  async quota(
    orgId: string,
    tx: PlanTxClient = this.prisma,
    now: Date = new Date(),
  ): Promise<Quota> {
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });
    // Организации нет — ограничивать некого. Так же вела себя и прежняя
    // проверка: отказ несуществующей организации никого не спасает,
    // а падение на ровном месте ломает выпуск живым.
    if (!org) return legacyPaidQuota(0);

    const plans = (await tx.plan.findMany({
      where: { orgId },
      orderBy: { startsAt: 'desc' },
    })) as PlanRecord[];
    const plan = pickPlan(plans, now);

    if (plan) {
      // Считаем выпущенное с начала плана, а не за всё время: план — это
      // объём за период, и прошлый год в него не входит.
      const used = await tx.file.count({
        where: { orgId, kind: 'generated', createdAt: { gte: plan.startsAt } },
      });
      return planQuota(plan, used, now);
    }

    const used = await tx.file.count({ where: { orgId, kind: 'generated' } });
    if (org.plan === 'paid') return legacyPaidQuota(used);

    const base = this.config.get('FREE_DOCUMENT_LIMIT', { infer: true });
    // Заработанное приглашениями прибавляется к пробе. Считается по фактам,
    // а не по счётчику, — см. ReferralService.
    const bonus = await this.referral.bonusDocuments(orgId, tx);
    return trialQuota(base, bonus, used);
  }

  /** Входит ли возможность в план организации. */
  async allows(orgId: string, feature: PlanFeature): Promise<boolean> {
    return allows(await this.quota(orgId), feature);
  }

  /**
   * Назначить план вручную.
   *
   * Прошлые планы не трогаем: по ним видно, что и когда было обещано,
   * а действующим считается последний начавшийся — см. `pickPlan`.
   * Самообслуживания и оплаты картой здесь нет вовсе: план заводит
   * человек после разговора.
   */
  async assign(orgId: string, input: PlanInput, assignedBy?: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });
    if (!org) throw new NotFoundException('Организация не найдена');

    const plan = await this.prisma.plan.create({
      data: {
        orgId,
        name: input.name,
        documentLimit: input.documentLimit,
        period: input.period,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        features: input.features,
        neverExpires: input.neverExpires,
        note: input.note ?? null,
        assignedBy: assignedBy ?? null,
      },
    });

    // В журнал — без адресов и имён: персональным данным в логах не место.
    this.logger.log(
      `Организации ${orgId} назначен план «${plan.name}» на ${plan.documentLimit} документов`,
    );
    return plan;
  }

  /** Все планы организации: и действующий, и прошлые. */
  async history(orgId: string) {
    return this.prisma.plan.findMany({ where: { orgId }, orderBy: { startsAt: 'desc' } });
  }
}
