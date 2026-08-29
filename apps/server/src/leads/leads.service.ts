import { Injectable, Logger } from '@nestjs/common';
import {
  CALL_TIME_LABELS,
  CONSENT_TEXT_VERSION,
  EVENT_KIND_LABELS,
  VOLUME_BAND_LABELS,
} from '@gramota/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { InvoicesService } from '../invoices/invoices.service';
import { maskEmail, redact } from '../common/redact';
import type { LeadDto, LeadStatusDto } from './leads.dto';

export interface LeadContext {
  ip?: string;
  userAgent?: string;
  referer?: string;
}

/**
 * Заявки на разговор об условиях.
 *
 * Единственный вход для крупных клиентов, поэтому здесь важнее не потерять
 * заявку, чем красиво обработать ошибку: она сначала сохраняется в базу
 * и только потом делается попытка отправить уведомление. Упавшая почта
 * не должна стоить нам клиента.
 */
@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly invoices: InvoicesService,
  ) {}

  /**
   * Цены тарифов в копейках — на случай заявки с уже согласованным тарифом.
   *
   * Публичных цен на сайте нет, форма тариф не присылает, и счёт по такой
   * заявке сам не выставляется: сумма появляется после разговора. Таблица
   * остаётся здесь ради дня, когда публичные пакеты вернутся.
   */
  private static readonly PRICES: Record<string, number> = {
    Старт: 2_900_000,
    Про: 6_900_000,
    Максимум: 14_900_000,
  };

  async create(dto: LeadDto, ctx: LeadContext): Promise<{ ok: true }> {
    // Ловушка: отвечаем как при успехе, чтобы автомат не понял, что распознан.
    if (dto.website) {
      this.logger.warn('Заявка от автомата отсеяна ловушкой');
      return { ok: true };
    }

    const lead = await this.prisma.lead.create({
      data: {
        orgName: dto.orgName,
        contact: dto.contact,
        email: dto.email,
        phone: dto.phone || null,
        inn: dto.inn || null,
        tariff: dto.tariff || null,
        volume: dto.volume ? VOLUME_BAND_LABELS[dto.volume] : null,
        comment: LeadsService.describe(dto),
        ip: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 500),
        source: ctx.referer?.slice(0, 500),
      },
    });

    this.logger.log(`Заявка ${lead.id} от «${dto.orgName}», ${maskEmail(dto.email)}`);

    // Уведомление — уже после сохранения и без права уронить ответ клиенту.
    void this.notify(lead.id, dto).catch((err: unknown) => {
      this.logger.error(`Уведомление о заявке ${lead.id} не ушло: ${redact(String(err))}`);
    });

    // Счёт выставляется сам, если заявки хватает: тариф известен и есть ИНН.
    // Без ИНН счёт бесполезен бухгалтерии клиента, без тарифа непонятна сумма —
    // в этих случаях остаётся обычная заявка, и мы отвечаем письмом.
    const amount = dto.tariff ? LeadsService.PRICES[dto.tariff] : undefined;
    if (amount && dto.inn && this.invoices.configured) {
      void this.invoices
        .issueAndSend({
          leadId: lead.id,
          buyerName: dto.orgName,
          buyerInn: dto.inn,
          email: dto.email,
          tariff: dto.tariff!,
          description: `Доступ к сервису «Вручай», тариф «${dto.tariff!}», 12 месяцев`,
          amountKopecks: amount,
        })
        .catch((err: unknown) => {
          this.logger.error(`Счёт по заявке ${lead.id} не выставлен: ${redact(String(err))}`);
        });
    }

    return { ok: true };
  }

  /**
   * Что человек рассказал о себе, одним текстом.
   *
   * Тип мероприятий, удобное время звонка и отметка о согласии складываются
   * в комментарий, потому что своих колонок под них в таблице заявок нет:
   * миграции в этой ветке не делаются. Отдельные поля добавит ветка A —
   * до тех пор строки разбираются глазами, а их немного.
   */
  private static describe(dto: LeadDto): string {
    const kinds = (dto.eventKinds ?? []).map((k) => EVENT_KIND_LABELS[k]);
    return [
      dto.comment || null,
      kinds.length ? `Тип мероприятий: ${kinds.join(', ')}` : null,
      dto.callTime ? `Удобное время звонка: ${CALL_TIME_LABELS[dto.callTime]}` : null,
      `Согласие на обработку данных: дано, редакция текста ${CONSENT_TEXT_VERSION}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Письмо себе о новой заявке. Адрес получателя — отправитель по умолчанию
   * организации-владельца сервиса: отдельной настройки заводить не стали,
   * пока продавец один.
   */
  private async notify(leadId: string, dto: LeadDto): Promise<void> {
    const sender = await this.prisma.sender.findFirst({
      where: { domain: { status: 'verified' } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!sender) {
      this.logger.warn(`Заявка ${leadId} сохранена, но уведомить некому: нет отправителя`);
      return;
    }
    await this.mail.sendNotice(
      sender.orgId,
      sender.email,
      `Заявка на обсуждение условий: ${dto.orgName}`,
      [
        `Организация: ${dto.orgName}`,
        `Контакт: ${dto.contact}`,
        `Почта: ${dto.email}`,
        dto.phone ? `Телефон: ${dto.phone}` : null,
        dto.volume ? `Объём: ${VOLUME_BAND_LABELS[dto.volume]}` : null,
        LeadsService.describe(dto),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  list(status?: string) {
    return this.prisma.lead.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  update(id: string, dto: LeadStatusDto) {
    return this.prisma.lead.update({
      where: { id },
      data: { status: dto.status, note: dto.note ?? undefined },
    });
  }
}
