import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush, { WebPushError } from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';
import type { SubscribeInput } from './push-endpoint';

/**
 * Что уходит в уведомление. Без персональных данных — тело push проходит
 * через сторонний сервис доставки (FCM, APNs, Mozilla) за пределы контура:
 * только «готово 300 из 300» и адрес страницы в кабинете.
 */
export interface PushMessage {
  title: string;
  body: string;
  /** Путь внутри кабинета, куда ведёт нажатие. */
  url: string;
  /** Одно уведомление на задание: новое заменяет прежнее, а не копится. */
  tag?: string;
}

/** Сколько ждать push-сервис. Дольше — уведомление всё равно опоздало бы. */
const SEND_TIMEOUT_MS = 10_000;

/**
 * Push-уведомления о готовности выпуска (ADR-0004).
 *
 * Ничего не бросает наружу: уведомление — приятная мелочь, и упавший
 * push-сервис не должен ронять выпуск, который уже закончился.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly key: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const publicKey = config.get('VAPID_PUBLIC_KEY', { infer: true });
    const privateKey = config.get('VAPID_PRIVATE_KEY', { infer: true });
    if (!publicKey || !privateKey) return;

    const publicUrl = config.get('PUBLIC_URL', { infer: true });
    // push-сервисы принимают контакт только mailto: или https:.
    const subject =
      config.get('VAPID_SUBJECT', { infer: true }) || (publicUrl.startsWith('https:') ? publicUrl : '');
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.key = publicKey;
    } catch (err) {
      this.logger.error(
        `Push выключен: ключи VAPID не подошли (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  /** Открытый ключ для браузера. null — push на этом сервере выключен. */
  publicKey(): string | null {
    return this.key;
  }

  /**
   * Запоминает подписку браузера за человеком в организации.
   *
   * Тот же браузер под другой учётной записью — та же подписка: она
   * переезжает к тому, кто вошёл сейчас, а не остаётся слать прежнему.
   */
  async subscribe(userId: string, orgId: string, input: SubscribeInput, userAgent?: string): Promise<void> {
    const data = {
      userId,
      orgId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
    };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { ...data, endpoint: input.endpoint },
      update: { ...data, lastSeenAt: new Date() },
    });
  }

  /** Удаляет только свою подписку: чужой адрес, даже известный, не трогаем. */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  }

  /** Шлёт уведомление на все браузеры человека в этой организации. */
  async notifyUser(userId: string | null | undefined, orgId: string, message: PushMessage): Promise<void> {
    if (!this.key || !userId) return;
    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId, orgId },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      });
      if (subscriptions.length === 0) return;
      const payload = JSON.stringify(message);
      await Promise.all(
        subscriptions.map((s) => this.send(s.id, { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)),
      );
    } catch (err) {
      this.logger.warn(`Не удалось разослать push: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async send(id: string, subscription: webpush.PushSubscription, payload: string): Promise<void> {
    try {
      await webpush.sendNotification(subscription, payload, {
        TTL: 60 * 60,
        urgency: 'normal',
        timeout: SEND_TIMEOUT_MS,
      });
    } catch (err) {
      // 404 и 410 — браузер отписался или подписка истекла: больше слать некуда.
      if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
        await this.prisma.pushSubscription.deleteMany({ where: { id } });
        return;
      }
      // В журнал — без адреса подписки: он уникален и указывает на браузер человека.
      this.logger.warn(
        `Push не доставлен (${err instanceof WebPushError ? `HTTP ${err.statusCode}` : 'сеть'}): ` +
          `${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
      );
    }
  }
}
