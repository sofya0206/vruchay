import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type DateFormat, type UiTheme } from '@prisma/client';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from '../referral/referral.service';
import { StorageService } from '../storage/storage.service';
import { buildS3Key } from '../storage/s3-key';
import type { AllowedImage } from '../common/image-type';
import type { UpdatePublicProfileDto } from './public-profile.dto';
import type { BillingDto } from './billing.dto';

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
  verifyDomain: true,
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
   * Логотип для публичной страницы: файл организации без материала.
   *
   * Прежний логотип убираем после того, как новый записан и привязан:
   * обратный порядок при сбое оставил бы организацию вовсе без логотипа.
   */
  async setLogo(orgId: string, body: Buffer, image: AllowedImage, originalName: string) {
    const previous = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { logoFileId: true },
    });

    const file = await this.prisma.file.create({
      data: {
        orgId,
        kind: 'asset',
        // Ключ строится из идентификатора, который база выдаёт только сейчас.
        s3Key: '',
        sizeBytes: body.length,
        mime: image.mime,
        originalName: originalName.slice(0, 255),
      },
    });
    const s3Key = buildS3Key({ orgId, kind: 'asset', fileId: file.id, ext: image.ext });
    await this.storage.put(s3Key, body, image.mime);
    await this.prisma.file.update({ where: { id: file.id }, data: { s3Key } });
    await this.prisma.organization.update({ where: { id: orgId }, data: { logoFileId: file.id } });

    if (previous.logoFileId) {
      const old = await this.prisma.file.findFirst({
        where: { id: previous.logoFileId, orgId },
        select: { id: true, s3Key: true },
      });
      if (old) {
        if (old.s3Key) await this.storage.remove(old.s3Key);
        await this.prisma.file.delete({ where: { id: old.id } }).catch(() => undefined);
      }
    }

    return this.publicProfile(orgId);
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

  /**
   * Реквизиты плательщика: что сохранено и что можно подставить.
   *
   * Свои реквизиты организация могла ни разу не заполнять, но счёт ей
   * уже выставляли — Invoice хранит копию реквизитов покупателя на
   * момент выставления. Оттуда и предлагаем: искать по адресу, на
   * который счёт ушёл, — единственная связь счёта с кабинетом (счета
   * растут из заявок и организации не принадлежат).
   */
  async billing(orgId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: {
        billingKind: true,
        billingName: true,
        billingInn: true,
        billingKpp: true,
        billingOgrn: true,
        billingAddress: true,
        billingEmail: true,
        contactEmail: true,
        name: true,
        inn: true,
        members: {
          where: { role: 'owner' },
          take: 1,
          select: { user: { select: { email: true } } },
        },
      },
    });

    const emails = [org.contactEmail, org.members[0]?.user.email]
      .filter((e): e is string => Boolean(e))
      .map((e) => e.toLowerCase());

    const lastInvoice = emails.length
      ? await this.prisma.invoice.findFirst({
          where: { email: { in: emails } },
          orderBy: { createdAt: 'desc' },
          select: { buyerName: true, buyerInn: true, email: true, createdAt: true },
        })
      : null;

    return {
      kind: org.billingKind,
      name: org.billingName,
      inn: org.billingInn,
      kpp: org.billingKpp,
      ogrn: org.billingOgrn,
      address: org.billingAddress,
      email: org.billingEmail,
      /**
       * Чем заполнить пустую форму. Не сохраняем молча: реквизиты
       * подтверждает человек, ошибка в них — непроведённый счёт.
       */
      suggested: lastInvoice
        ? {
            from: 'invoice' as const,
            name: lastInvoice.buyerName,
            inn: lastInvoice.buyerInn,
            email: lastInvoice.email,
            at: lastInvoice.createdAt,
          }
        : { from: 'org' as const, name: org.name, inn: org.inn ?? '', email: emails[0] ?? '', at: null },
    };
  }

  async updateBilling(orgId: string, dto: BillingDto) {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        billingKind: dto.kind,
        billingName: dto.name,
        billingInn: dto.inn,
        billingKpp: dto.kpp,
        billingOgrn: dto.ogrn,
        billingAddress: dto.address,
        billingEmail: dto.email,
      },
    });
    return { ok: true as const };
  }

  /**
   * Домен, на который ведут ссылки и QR со страницы проверки.
   *
   * Пустая строка — общий домен сервиса. Само обслуживание чужого
   * домена (сертификат, маршрутизация) сюда не входит: поле сохраняем
   * и показываем, чем оно станет.
   */
  async setVerifyDomain(orgId: string, domain: string) {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { verifyDomain: domain },
    });
    return { ok: true as const };
  }

  /**
   * Тема и формат дат. Настройка человека, а не организации: один
   * сотрудник состоит в нескольких, а глаза у него одни.
   */
  async preferences(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { theme: true, dateFormat: true },
    });
    return user;
  }

  async updatePreferences(userId: string, dto: { theme?: UiTheme; dateFormat?: DateFormat }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: { theme: true, dateFormat: true },
    });
  }
}
