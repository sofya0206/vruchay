import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Словарь кода приглашения.
 *
 * Нет нуля и буквы «o», единицы, «l» и «i»: код будут диктовать по телефону
 * и переписывать с экрана на бумажку, и пара «ноль или буква О» стоит
 * дороже, чем несколько лишних сочетаний в словаре.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 6;

/**
 * То, чем ReferralService читает базу: обычный клиент или транзакция.
 * Транзакция Prisma не совпадает с PrismaService по типу, а нужны от них
 * здесь одни и те же две таблицы.
 */
export type ReferralReader = Pick<PrismaService, 'organization' | 'file'>;

export interface ReferralSummary {
  code: string;
  link: string;
  /** Готовый текст, который человек перешлёт в мессенджере. */
  message: string;
  invitedTotal: number;
  invitedWorking: number;
  bonusEarned: number;
  welcomeBonus: number;
  rewardPerFriend: number;
  qualifyDocuments: number;
  maxRewarded: number;
  invited: Array<{ name: string; joinedAt: Date; working: boolean }>;
}

/**
 * Приглашение друга.
 *
 * Начисленного нигде не храним — считаем по факту: сколько приглашённых
 * организаций выпустили свои первые документы. Это тот же приём, что и
 * в проверке бесплатной пробы: счётчик пришлось бы чинить при каждом
 * удалении и сбое, а факты чинить не нужно.
 */
@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get welcomeBonus() {
    return Number(process.env.REFERRAL_WELCOME_BONUS ?? 50);
  }
  private get rewardPerFriend() {
    return Number(process.env.REFERRAL_REWARD ?? 50);
  }
  private get qualifyDocuments() {
    return Number(process.env.REFERRAL_QUALIFY_DOCUMENTS ?? 10);
  }
  private get maxRewarded() {
    return Number(process.env.REFERRAL_MAX_REWARDED ?? 20);
  }

  /**
   * Дополнительные документы сверх бесплатной пробы.
   *
   * Вызывается из проверки лимита, поэтому обязана быть дешёвой: два
   * запроса без соединений, оба по индексам.
   *
   * `client` позволяет вызвать это изнутри чужой транзакции. Проверка
   * лимита идёт под замком на организацию, и запросы мимо транзакции
   * читали бы состояние вне замка — то самое, от которого замок и защищает.
   */
  async bonusDocuments(orgId: string, client: ReferralReader = this.prisma): Promise<number> {
    const org = await client.organization.findUnique({
      where: { id: orgId },
      select: { referredByOrgId: true },
    });
    if (!org) return 0;

    const welcome = org.referredByOrgId ? this.welcomeBonus : 0;
    const { working } = await this.countInvited(orgId, false, client);
    const rewarded = Math.min(working, this.maxRewarded);

    return welcome + rewarded * this.rewardPerFriend;
  }

  /** Всё, что показывает раздел «Пригласить друга». */
  async summary(orgId: string, orgName: string): Promise<ReferralSummary> {
    const code = await this.ensureCode(orgId);
    const link = `${publicUrl()}/register?ref=${code}`;
    const { total, working, invited } = await this.countInvited(orgId, true);
    const rewarded = Math.min(working, this.maxRewarded);

    return {
      code,
      link,
      message: this.inviteMessage(orgName, link),
      invitedTotal: total,
      invitedWorking: working,
      bonusEarned: rewarded * this.rewardPerFriend,
      welcomeBonus: this.welcomeBonus,
      rewardPerFriend: this.rewardPerFriend,
      qualifyDocuments: this.qualifyDocuments,
      maxRewarded: this.maxRewarded,
      invited,
    };
  }

  /**
   * Текст сообщения готовим на сервере, а не заставляем человека
   * придумывать его самому. Наши пользователи — тренеры и секретари
   * федераций, а не маркетологи; пустое поле «напишите другу» их
   * останавливает надёжнее любого технического сбоя.
   */
  private inviteMessage(orgName: string, link: string): string {
    const from = orgName.trim() ? `Мы в ${quoted(orgName)}` : 'Мы';
    return (
      `${from} выдаём грамоты и сертификаты через сервис «Вручай»: ` +
      `загружаешь список участников — он сам делает именные файлы и рассылает их по почте. ` +
      `Вручную это занимало два дня, теперь — полчаса.\n\n` +
      `Вот приглашение, по нему дают ${this.welcomeBonus + Number(process.env.FREE_DOCUMENT_LIMIT ?? 50)} ` +
      `бесплатных документов вместо ${Number(process.env.FREE_DOCUMENT_LIMIT ?? 50)}:\n${link}`
    );
  }

  /**
   * Найти организацию по коду. Регистр не важен: код диктуют голосом
   * и печатают как придётся.
   */
  async resolveCode(rawCode: string): Promise<string | null> {
    const code = rawCode.trim().toLowerCase();
    if (!/^[a-z0-9]{4,16}$/.test(code)) return null;

    const org = await this.prisma.organization.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    return org?.id ?? null;
  }

  /** Код заводим лениво — при первом открытии раздела. */
  private async ensureCode(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { referralCode: true },
    });
    if (org?.referralCode) return org.referralCode;

    // Столкновения возможны, поэтому не полагаемся на удачу с первого раза:
    // уникальность стережёт база, а мы просто пробуем ещё.
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateCode();
      try {
        await this.prisma.organization.update({
          where: { id: orgId },
          data: { referralCode: code },
        });
        return code;
      } catch {
        this.logger.warn(`Код приглашения ${code} занят, пробую другой`);
      }
    }
    throw new Error('Не удалось выдать код приглашения');
  }

  /**
   * Сколько организаций пришло по нашему приглашению и сколько из них
   * действительно работают.
   *
   * «Работают» — значит выпустили не меньше REFERRAL_QUALIFY_DOCUMENTS
   * документов. Просто зарегистрироваться недостаточно: иначе бонусы
   * зарабатывались бы заведением пустых организаций на свободные ящики.
   */
  private async countInvited(
    orgId: string,
    withList = false,
    client: ReferralReader = this.prisma,
  ) {
    const invitedOrgs = await client.organization.findMany({
      where: { referredByOrgId: orgId },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    if (invitedOrgs.length === 0) {
      return { total: 0, working: 0, invited: [] };
    }

    const counts = await client.file.groupBy({
      by: ['orgId'],
      where: { orgId: { in: invitedOrgs.map((o) => o.id) }, kind: 'generated' },
      _count: { _all: true },
    });
    const issued = new Map(counts.map((c) => [c.orgId, c._count._all]));

    const invited = invitedOrgs.map((o) => ({
      name: o.name,
      joinedAt: o.createdAt,
      working: (issued.get(o.id) ?? 0) >= this.qualifyDocuments,
    }));

    return {
      total: invited.length,
      working: invited.filter((i) => i.working).length,
      invited: withList ? invited : [],
    };
  }
}

/**
 * Название организации в кавычках — но не в двух парах сразу.
 *
 * Спортшколы и федерации сплошь и рядом называются «Спортшкола «Олимп»»,
 * и безусловные кавычки давали «Мы в «Спортшкола «Олимп»»» — сообщение,
 * которое человек постесняется переслать знакомому.
 */
function quoted(name: string): string {
  const trimmed = name.trim();
  return /[«»"']/.test(trimmed) ? trimmed : `«${trimmed}»`;
}

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

function publicUrl(): string {
  return (process.env.PUBLIC_URL ?? 'https://vruchay.ru').replace(/\/+$/, '');
}
