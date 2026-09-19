import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type IORedis from 'ioredis';
import { InjectRedis } from '../common/redis.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Счётчик проверок подлинности — по тем же правилам, что пиксель открытий
 * писем (mail/open-tracking.ts): записываем факт, а не проверяющего.
 *
 * Что попадает на диск: строка «документ, день, проверок, из них первых
 * за сутки» и общий счётчик на файле. Адрес и сведения о браузере
 * читаются в памяти, чтобы отсеять повтор и роботов, и нигде не
 * сохраняются: ни в базе, ни в логах, ни в Redis в открытом виде.
 *
 * Повтор за сутки отсеивается хешем `sha256(соль дня + документ + адрес
 * + браузер)`. Соль случайная, живёт двое суток и потом исчезает вместе
 * с ключами — восстановить по хешу адрес нельзя ни нам, ни кому-то ещё,
 * а через сутки он бесполезен даже для счёта. Так делают Plausible
 * и GoatCounter, и это единственный способ не считать F5 десять раз,
 * не заводя cookie на публичной странице.
 */

/** Сколько живёт отметка «сегодня уже открывали». */
const DAY_SECONDS = 86_400;
/** Соль переживает день, чтобы ключи, поставленные под вечер, дожили до утра. */
const SALT_SECONDS = 2 * DAY_SECONDS;

/**
 * Роботы и предпросмотры мессенджеров. Телеграм и WhatsApp дёргают ссылку
 * в момент отправки — без отсева каждая пересылка ссылки выглядела бы
 * как проверка. Список короткий и намеренно грубый: пропустить робота
 * дешевле, чем не засчитать человека.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|preview|fetch|curl|wget|python-requests|telegram|whatsapp|vkshare|facebookexternalhit|skypeuripreview|discordbot|headless/i;

export interface CheckContext {
  /** Организация из сессии, если проверку открыли из кабинета. */
  sessionOrgId?: string | null;
  ip?: string;
  userAgent?: string;
  method?: string;
}

export interface Checked {
  counted: boolean;
  unique: boolean;
}

/** Календарный день по Москве — тот же, по которому считает сводка. */
export function mskDay(now: Date): string {
  return new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

/** Не считать: свой кабинет, робот, запрос без тела. */
export function shouldCount(file: { orgId: string }, ctx: CheckContext): boolean {
  if (ctx.method && ctx.method !== 'GET') return false;
  if (ctx.sessionOrgId && ctx.sessionOrgId === file.orgId) return false;
  if (ctx.userAgent && BOT_UA.test(ctx.userAgent)) return false;
  return true;
}

@Injectable()
export class VerifyCounter {
  private readonly logger = new Logger(VerifyCounter.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: IORedis,
  ) {}

  async count(
    file: { id: string; orgId: string },
    ctx: CheckContext,
    now = new Date(),
  ): Promise<Checked> {
    if (!shouldCount(file, ctx)) return { counted: false, unique: false };

    const day = mskDay(now);
    const unique = await this.firstToday(day, file.id, ctx);
    try {
      await this.prisma.$transaction([
        this.prisma.file.update({
          where: { id: file.id },
          data: { verifyCount: { increment: 1 }, verifyLastAt: now },
        }),
        this.prisma.verifyDaily.upsert({
          where: { fileId_day: { fileId: file.id, day: new Date(day) } },
          create: {
            fileId: file.id,
            orgId: file.orgId,
            day: new Date(day),
            checks: 1,
            uniques: unique ? 1 : 0,
          },
          update: { checks: { increment: 1 }, uniques: { increment: unique ? 1 : 0 } },
        }),
      ]);
    } catch (err) {
      this.logger.warn(
        `Не удалось учесть проверку документа: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return { counted: true, unique };
  }

  /**
   * Первое ли это открытие за день с этого адреса и браузера.
   * Без Redis считаем уникальным: потерять уникальность честнее,
   * чем потерять проверку, а без адреса и хешировать нечего.
   */
  private async firstToday(day: string, fileId: string, ctx: CheckContext): Promise<boolean> {
    if (!ctx.ip) return true;
    try {
      const salt = await this.saltFor(day);
      const digest = createHash('sha256')
        .update(`${salt}|${fileId}|${ctx.ip}|${ctx.userAgent ?? ''}`)
        .digest('hex');
      const set = await this.redis.set(`vf:${day}:${digest}`, '1', 'EX', DAY_SECONDS, 'NX');
      return set === 'OK';
    } catch (err) {
      this.logger.warn(
        `Redis недоступен, повтор не отсеян: ${err instanceof Error ? err.message : String(err)}`,
      );
      return true;
    }
  }

  private async saltFor(day: string): Promise<string> {
    const key = `vf:salt:${day}`;
    const fresh = randomBytes(32).toString('hex');
    // NX: соль ставит первый пришедший, остальные читают его значение.
    await this.redis.set(key, fresh, 'EX', SALT_SECONDS, 'NX');
    return (await this.redis.get(key)) ?? fresh;
  }
}
