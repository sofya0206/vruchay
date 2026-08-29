import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from '../plans/plans.service';

/**
 * Организация и собственный профиль.
 *
 * Заводится ради двух вещей, которых человеку раньше было негде сделать:
 * поправить название организации и своё имя. Оба задавались один раз при
 * регистрации и застревали навсегда — а название стоит в приглашении
 * друга, в отзыве на главной и в имени отправителя писем участникам.
 * Опечатка в нём расходилась по всем трём местам без всякой возможности
 * её исправить.
 */
@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  async profile(orgId: string, userId: string) {
    const [org, user] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true, plan: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      }),
    ]);

    return {
      orgName: org?.name ?? '',
      plan: org?.plan ?? 'free',
      userName: user?.name ?? '',
      email: user?.email ?? '',
    };
  }

  async renameOrg(orgId: string, name: string) {
    await this.prisma.organization.update({ where: { id: orgId }, data: { name: name.trim() } });
    return { ok: true as const };
  }

  async renameUser(userId: string, name: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { name: name.trim() } });
    return { ok: true as const };
  }

  /**
   * Сколько документов уже выпущено и сколько осталось.
   *
   * Показывается в кабинете постоянно, а не только в отказе. Узнать
   * о конце квоты на сорок седьмом документе из пятидесяти — это уже
   * испорченное награждение: человек не успевает ни договориться
   * о продолжении, ни разделить список.
   *
   * Считает не сама, а спрашивает у PlansService — тот же ответ, что
   * получит выпуск. Иначе цифра в кабинете и решение о допуске к выпуску
   * однажды разошлись бы, и разошлись бы в самый неподходящий момент.
   */
  async usage(orgId: string) {
    const quota = await this.plans.quota(orgId);
    return {
      /** Что говорить человеку про его условия. */
      plan: quota.source === 'trial' ? ('free' as const) : ('paid' as const),
      planName: quota.name,
      source: quota.source,
      used: quota.used,
      limit: quota.limit,
      left: quota.left,
      bonus: quota.bonus,
      /** «Осталось меньше двадцати процентов» и «меньше десяти». */
      warn: quota.warn,
      endsAt: quota.endsAt,
      expired: quota.expired,
      neverExpires: quota.neverExpires,
      features: quota.features,
    };
  }
}
