import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import type { Env } from '../config/env';
import { AuthGuard } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { ReferralService } from './referral.service';

const offerSchema = z.object({ ref: z.string().trim().max(16) });

/**
 * Раздел «Пригласить друга» открыт любому сотруднику организации: звать
 * коллег из соседней организации будет тот, кто с ними знаком, а не
 * обязательно владелец учётной записи.
 */
@Controller('referral')
@UseGuards(AuthGuard)
export class ReferralController {
  constructor(
    private readonly referral: ReferralService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async summary(@CurrentUser() user: SessionUser) {
    const org = await this.prisma.organization.findUnique({
      where: { id: user.orgId },
      select: { name: true },
    });
    return this.referral.summary(user.orgId, org?.name ?? '');
  }
}

/**
 * Что обещано пришедшему по ссылке — до регистрации, поэтому без входа.
 *
 * Наружу уходит только название пригласившей организации: его она и так
 * сообщила тому, кому дала ссылку. Перебор кодов ограничен по частоте —
 * иначе страница превратилась бы в способ вычитывать список наших
 * клиентов по одному коду за раз.
 */
@Controller('referral-offer')
@UseGuards(ThrottleGuard)
export class ReferralOfferController {
  constructor(
    private readonly referral: ReferralService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  @Throttle({ max: 20, timeWindow: '5 minutes' })
  async offer(@Query(new ZodValidationPipe(offerSchema)) query: z.infer<typeof offerSchema>) {
    const freeLimit = this.config.get('FREE_DOCUMENT_LIMIT', { infer: true });
    const welcomeBonus = this.config.get('REFERRAL_WELCOME_BONUS', { infer: true });

    const orgId = await this.referral.resolveCode(query.ref);
    if (!orgId) return { valid: false as const, freeLimit };

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });

    return {
      valid: true as const,
      invitedBy: org?.name ?? '',
      freeLimit,
      welcomeBonus,
      total: freeLimit + welcomeBonus,
    };
  }
}
