import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Обращения в поддержку и дорожная карта.
 *
 * Раньше написать нам можно было только письмом на общий адрес, и человек
 * не видел ни номера обращения, ни того, прочитали ли его вообще. Здесь
 * переписка привязана к организации: её видят все её сотрудники, потому
 * что отвечать может не тот, кто спрашивал.
 *
 * Всё ищется по orgId из сессии, а не по идентификатору из запроса:
 * чужое обращение не открыть и не дополнить, ответ на попытку — 404.
 */
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async listTickets(orgId: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { orgId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { name: true } },
        _count: { select: { messages: true } },
      },
    });

    return tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      author: t.user?.name ?? '',
      messages: t._count.messages,
    }));
  }

  async ticket(orgId: string, id: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, orgId },
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            text: true,
            fromSupport: true,
            createdAt: true,
            user: { select: { name: true } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Обращение не найдено');

    return {
      ...ticket,
      messages: ticket.messages.map((m) => ({
        id: m.id,
        text: m.text,
        fromSupport: m.fromSupport,
        createdAt: m.createdAt,
        author: m.fromSupport ? 'Поддержка' : (m.user?.name ?? ''),
      })),
    };
  }

  async createTicket(orgId: string, userId: string, subject: string, text: string) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        orgId,
        userId,
        subject,
        messages: { create: { userId, text } },
      },
      select: { id: true },
    });
    return { id: ticket.id };
  }

  /**
   * Ответ в свою переписку. Закрытое обращение снова открывается: человек
   * пишет туда же, когда та же беда повторилась, и заводить второе
   * обращение ради этого незачем.
   */
  async reply(orgId: string, userId: string, id: string, text: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, orgId },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException('Обращение не найдено');

    await this.prisma.$transaction([
      this.prisma.supportMessage.create({ data: { ticketId: id, userId, text } }),
      this.prisma.supportTicket.update({ where: { id }, data: { status: 'open' } }),
    ]);
    return { ok: true as const };
  }

  async closeTicket(orgId: string, id: string) {
    const { count } = await this.prisma.supportTicket.updateMany({
      where: { id, orgId },
      data: { status: 'closed' },
    });
    if (count === 0) throw new NotFoundException('Обращение не найдено');
    return { ok: true as const };
  }

  /** Дорожная карта: что сделано, что в работе, что задумано, и голоса. */
  async roadmap(orgId: string) {
    const items = await this.prisma.roadmapItem.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        _count: { select: { votes: true } },
        votes: { where: { orgId }, select: { orgId: true } },
      },
    });

    return items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      status: i.status,
      votes: i._count.votes,
      voted: i.votes.length > 0,
    }));
  }

  /**
   * Голос за пункт. Один на организацию: иначе голосовали бы приглашениями
   * сотрудников. Повторный голос не ошибка — просто ничего не меняет.
   */
  async vote(orgId: string, itemId: string) {
    const item = await this.prisma.roadmapItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Пункт не найден');

    await this.prisma.roadmapVote.upsert({
      where: { itemId_orgId: { itemId, orgId } },
      create: { itemId, orgId },
      update: {},
    });
    return { ok: true as const };
  }

  async unvote(orgId: string, itemId: string) {
    await this.prisma.roadmapVote.deleteMany({ where: { itemId, orgId } });
    return { ok: true as const };
  }
}
