import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { maskEmail, redact } from '../common/redact';
import type { LeadDto, LeadStatusDto } from './leads.dto';

export interface LeadContext {
  ip?: string;
  userAgent?: string;
  referer?: string;
}

/**
 * Заявки на счёт с посадочной страницы.
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
  ) {}

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
        volume: dto.volume || null,
        comment: dto.comment || null,
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

    return { ok: true };
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
      `Заявка на счёт: ${dto.orgName}`,
      [
        `Организация: ${dto.orgName}`,
        `Контакт: ${dto.contact}`,
        `Почта: ${dto.email}`,
        dto.phone ? `Телефон: ${dto.phone}` : null,
        dto.volume ? `Объём: ${dto.volume}` : null,
        dto.comment ? `Комментарий: ${dto.comment}` : null,
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
