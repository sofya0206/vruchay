import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from '../referral/referral.service';
import { StorageService } from '../storage/storage.service';
import type { UpdatePublicProfileDto } from './public-profile.dto';

/** Что организация показывает о себе наружу и как показывает получателей. */
export const publicProfileSelect = {
  slug: true,
  description: true,
  inn: true,
  website: true,
  contactEmail: true,
  contactPhone: true,
  logoFileId: true,
  verifiedIssuer: true,
  verifiedAt: true,
  publicPageEnabled: true,
  publicSearchByName: true,
  publicIndexable: true,
  verifyNameMode: true,
} satisfies Prisma.OrganizationSelect;

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
    private readonly referral: ReferralService,
    private readonly config: ConfigService<Env, true>,
    private readonly storage: StorageService,
  ) {}

  async publicProfile(orgId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { ...publicProfileSelect, name: true, logo: { select: { s3Key: true } } },
    });
    const { logo, ...rest } = org;
    return {
      ...rest,
      // Ссылка на логотип временная, как и на все файлы из хранилища.
      logoUrl: logo?.s3Key ? await this.storage.presignedGetUrl(logo.s3Key) : null,
    };
  }

  /**
   * Правка публичного лица.
   *
   * Значок верифицированного эмитента здесь не правится намеренно —
   * его ставит владелец сервиса (PlatformController): это наше
   * ручательство, и выдавать его себе организация не может.
   */
  async updatePublicProfile(orgId: string, dto: UpdatePublicProfileDto) {
    const { consentConfirmed: _consent, ...data } = dto;
    try {
      await this.prisma.organization.update({ where: { id: orgId }, data });
    } catch (err) {
      // Уникальность адреса держит база: два кабинета могли попросить
      // один и тот же адрес одновременно, и проверка до записи этого
      // не отловила бы.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Этот адрес уже занят другой организацией');
      }
      throw err;
    }
    return this.publicProfile(orgId);
  }

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
   * о конце пробы на сорок седьмом документе из пятидесяти — это уже
   * испорченное награждение: человек не успевает ни доплатить,
   * ни разделить список.
   *
   * Считаем по файлам, а не отдельным счётчиком, — тем же способом,
   * каким проверяется сам лимит. Иначе цифра в кабинете и решение
   * о допуске к выпуску однажды разошлись бы.
   */
  async usage(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });

    const used = await this.prisma.file.count({ where: { orgId, kind: 'generated' } });
    if (org?.plan === 'paid') {
      return { plan: 'paid' as const, used, limit: null, left: null, bonus: 0 };
    }

    const base = this.config.get('FREE_DOCUMENT_LIMIT', { infer: true });
    const bonus = await this.referral.bonusDocuments(orgId);
    const limit = base + bonus;

    return {
      plan: 'free' as const,
      used,
      limit,
      left: Math.max(0, limit - used),
      bonus,
    };
  }
}
