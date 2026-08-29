import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PLAN_FEATURE_KEYS, PLAN_PERIOD_KEYS, type PlanFeature } from '@gramota/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformOnlyGuard } from '../auth/platform-only.guard';
import { uuidSchema } from '../documents/documents.dto';
import { AuditActor } from '../audit/actor.decorator';
import { AuditService, type Actor } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';
import { PlatformService } from './platform.service';

const uuidParam = new ZodValidationPipe(uuidSchema);
const planSchema = z.object({ plan: z.enum(['free', 'paid']) });

/**
 * Условия, о которых договорились: объём, срок и что входит.
 *
 * Проверяем на границе и по белому списку — иначе в базу попадёт план
 * с отрицательным лимитом или с возможностью, которой в коде нет,
 * и разбираться в этом придётся посреди чужого награждения.
 */
export const assignPlanSchema = z
  .object({
    name: z.string().trim().min(2, 'У плана должно быть название').max(200),
    documentLimit: z.coerce
      .number({ message: 'Лимит документов — целое число' })
      .int('Лимит документов — целое число: документ выпускается целиком')
      .positive('Лимит документов должен быть больше нуля')
      .max(10_000_000, 'Такой лимит выглядит опечаткой'),
    period: z.enum(PLAN_PERIOD_KEYS as [string, ...string[]], {
      message: 'Период — «package» (разовый пакет) или «year» (год)',
    }),
    /** Пусто — план начинается сейчас. */
    startsAt: z.coerce.date({ message: 'Начало плана — дата' }).optional(),
    /** Пусто — срок не ограничен. */
    endsAt: z.coerce.date({ message: 'Окончание плана — дата' }).nullish(),
    /**
     * По умолчанию входит всё. Ограничение — решение переговоров,
     * и принимать его должен человек, а не забытое поле в запросе.
     */
    features: z
      .array(
        z.enum(PLAN_FEATURE_KEYS as [string, ...string[]], {
          message: `Возможности плана — из списка: ${PLAN_FEATURE_KEYS.join(', ')}`,
        }),
      )
      .default(PLAN_FEATURE_KEYS),
    neverExpires: z.boolean().default(false),
    note: z.string().trim().max(2000, 'Заметка слишком длинная').optional(),
  })
  .refine((v) => !v.endsAt || !v.startsAt || v.endsAt > v.startsAt, {
    message: 'Окончание плана раньше его начала',
    path: ['endsAt'],
  });

/**
 * Организации-клиенты глазами владельца сервиса.
 *
 * Единственное действие — перевести с бесплатной пробы на оплаченный
 * тариф и обратно. До этого оно делалось правкой в базе: команда,
 * которую страшно выполнять в три часа ночи после поступления денег,
 * и о которой негде прочитать, кто и когда её выполнял.
 *
 * Никаких данных внутри организаций отсюда не видно — только название,
 * тариф и сколько выпущено. Читать чужие списки участников владелец
 * сервиса не должен, и техническая возможность для этого не заводится.
 */
@Controller('platform/organizations')
@UseGuards(AuthGuard, PlatformOnlyGuard)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly plans: PlansService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.platform.listOrganizations();
  }

  @Patch(':id/plan')
  async setPlan(
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(planSchema)) dto: z.infer<typeof planSchema>,
  ) {
    const result = await this.platform.setPlan(id, dto.plan);

    // Пишем в журнал нашей организации, а не клиентской: это наше
    // действие, и отвечать за него нам.
    await this.audit.record({
      actor,
      action: 'platform.plan',
      summary:
        dto.plan === 'paid'
          ? `Организация «${result.name}» переведена на оплаченный тариф`
          : `Организация «${result.name}» возвращена на бесплатную пробу`,
      targetType: 'organization',
      targetId: id,
      meta: { plan: dto.plan },
    });

    return result;
  }

  /** Что положено организации сейчас — цифрой, а не на словах. */
  @Get(':id/plan')
  quota(@Param('id', uuidParam) id: string) {
    return this.plans.quota(id);
  }

  /** Все планы организации: и действующий, и прошлые. */
  @Get(':id/plans')
  plansOf(@Param('id', uuidParam) id: string) {
    return this.plans.history(id);
  }

  /**
   * Назначить план вручную — после разговора, а не по нажатию клиента.
   *
   * Самообслуживания и оплаты картой здесь нет вовсе: цена обсуждается
   * лично, и заводит план тот, кто её обсуждал.
   */
  @Post(':id/plans')
  async assignPlan(
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(assignPlanSchema)) dto: z.infer<typeof assignPlanSchema>,
  ) {
    const plan = await this.plans.assign(
      id,
      {
        name: dto.name,
        documentLimit: dto.documentLimit,
        period: dto.period as 'package' | 'year',
        startsAt: dto.startsAt ?? new Date(),
        endsAt: dto.endsAt ?? null,
        features: dto.features as PlanFeature[],
        neverExpires: dto.neverExpires,
        note: dto.note,
      },
      actor.email,
    );

    /*
     * Организацию заодно снимаем с бесплатной пробы: назначенный план
     * старую колонку `plan` не читает, но она осталась у половины
     * кабинета, и «у вас бесплатная проба» рядом с оплаченным планом
     * на пятьсот документов — это вопрос в поддержку.
     */
    await this.platform.setPlan(id, 'paid');

    await this.audit.record({
      actor,
      action: 'platform.plan.assign',
      summary: `Назначен план «${plan.name}» на ${plan.documentLimit} документов`,
      targetType: 'organization',
      targetId: id,
      meta: {
        planId: plan.id,
        documentLimit: plan.documentLimit,
        period: plan.period,
        endsAt: plan.endsAt?.toISOString() ?? null,
      },
    });

    return plan;
  }
}
