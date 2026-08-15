import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Кто совершил действие. Пусто — значит система, например ночная очистка. */
export interface Actor {
  orgId: string;
  userId?: string;
  name?: string;
  email?: string;
  ip?: string;
}

/**
 * Журнал действий.
 *
 * Пишем только то, у чего есть последствия снаружи: выпуск и рассылка
 * документов, отзыв проверки, окончательное удаление, изменения в составе
 * сотрудников. Открытие страниц и правку макета не пишем — в таком потоке
 * тонет то немногое, ради чего журнал и заведён.
 *
 * Запись никогда не роняет действие. Журнал — свидетельство о том, что
 * произошло; если он не смог записать, произошедшее от этого не отменяется,
 * а отказ выпустить триста грамот из-за неудачной записи в журнал был бы
 * несоразмерным лечением.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    actor: Actor;
    action: string;
    summary: string;
    targetType?: string;
    targetId?: string;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          orgId: params.actor.orgId,
          userId: params.actor.userId ?? null,
          // Имя и адрес копией: сотрудник может уволиться и быть удалён,
          // а запись обязана остаться читаемой.
          actorName: params.actor.name ?? '',
          actorEmail: params.actor.email ?? '',
          action: params.action,
          summary: params.summary,
          targetType: params.targetType ?? null,
          targetId: params.targetId ?? null,
          meta: (params.meta ?? {}) as object,
          ip: params.actor.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Не удалось записать в журнал (${params.action}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Журнал организации, новые сверху.
   *
   * Отдаём страницами: за сезон у федерации накапливаются тысячи записей,
   * и выгружать их разом означало бы вешать кабинет на открытии вкладки.
   */
  async list(orgId: string, params: { limit: number; offset: number; action?: string }) {
    const where = { orgId, ...(params.action ? { action: params.action } : {}) };

    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit,
        skip: params.offset,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return {
      total,
      limit: params.limit,
      offset: params.offset,
      items: items.map((e) => ({
        // BigInt не переживает JSON.stringify — приводим к строке здесь,
        // а не оставляем ловушку на слое сериализации.
        id: e.id.toString(),
        action: e.action,
        summary: e.summary,
        actorName: e.actorName,
        actorEmail: e.actorEmail,
        targetType: e.targetType,
        targetId: e.targetId,
        createdAt: e.createdAt,
      })),
    };
  }
}
