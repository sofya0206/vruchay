import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Отзывы заказчиков.
 *
 * Отзыв всегда проходит проверку человеком перед публикацией. Не из
 * недоверия к авторам: опубликованный отзыв называет организацию,
 * должность и имя, то есть выносит наружу сведения о людях — и цена
 * ошибки здесь не «некрасиво выглядит», а «опубликовали то, чего
 * не собирались».
 *
 * Отзыв — один на организацию. Он говорит от лица организации, а не
 * сотрудника; десять отзывов от одной организации были бы не десятью
 * мнениями, а одним, повторённым десять раз.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Отзыв этой организации, если он уже есть. */
  async mine(orgId: string) {
    return this.prisma.review.findFirst({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        authorName: true,
        authorRole: true,
        orgName: true,
        text: true,
        rating: true,
        status: true,
        moderatorNote: true,
        createdAt: true,
        publishedAt: true,
      },
    });
  }

  /**
   * Оставить или переписать свой отзыв.
   *
   * Повторная отправка заменяет прежний и снова отправляет его на
   * проверку. Иначе исправленный после замечания отзыв остался бы
   * отклонённым навсегда, а человеку пришлось бы гадать, что делать.
   */
  async submit(
    orgId: string,
    userId: string,
    dto: { authorName: string; authorRole: string; orgName: string; text: string; rating?: number },
  ) {
    const existing = await this.prisma.review.findFirst({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });

    const data = {
      authorName: dto.authorName.trim(),
      authorRole: dto.authorRole.trim(),
      orgName: dto.orgName.trim(),
      text: dto.text.trim(),
      rating: dto.rating ?? null,
      // Правка снимает публикацию: на витрине не должно оказаться
      // непроверенного текста только потому, что прежний был одобрен.
      status: 'pending' as const,
      moderatorNote: null,
      publishedAt: null,
    };

    if (existing) {
      return this.prisma.review.update({ where: { id: existing.id }, data });
    }
    return this.prisma.review.create({ data: { ...data, orgId, userId } });
  }

  /** Убрать свой отзыв. */
  async remove(orgId: string, reviewId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, orgId },
      select: { id: true },
    });
    // Чужой отзыв не находится, а не «запрещён»: иначе по ответу можно
    // было бы узнавать, какие отзывы вообще существуют.
    if (!review) throw new NotFoundException('Отзыв не найден');

    await this.prisma.review.delete({ where: { id: review.id } });
    return { ok: true as const };
  }

  /**
   * Опубликованные отзывы — для посадочной страницы.
   *
   * Отдаём только то, что автор согласился показать: имя, должность,
   * организацию и текст. Ни адреса, ни идентификаторов организации
   * наружу не уходит.
   */
  async published(limit: number) {
    const items = await this.prisma.review.findMany({
      where: { status: 'published', publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: {
        authorName: true,
        authorRole: true,
        orgName: true,
        text: true,
        rating: true,
        publishedAt: true,
      },
    });
    return { items };
  }

  // --- Проверка отзывов оператором сервиса ---

  /**
   * Все отзывы на проверке. Доступно только организации-владельцу
   * площадки: право решать, что висит на нашей витрине, принадлежит нам,
   * а не тому, кто первым вызовет этот метод.
   */
  async listForModeration(status?: 'pending' | 'published' | 'rejected') {
    return this.prisma.review.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async moderate(reviewId: string, decision: { publish: boolean; note?: string }) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true },
    });
    if (!review) throw new NotFoundException('Отзыв не найден');

    if (!decision.publish && !decision.note?.trim()) {
      // Отклонение без причины оставляет автора в тупике: он не знает,
      // что исправлять, и просто больше не вернётся.
      throw new BadRequestException('Укажите, что не так с отзывом — это увидит автор');
    }

    return this.prisma.review.update({
      where: { id: review.id },
      data: decision.publish
        ? { status: 'published', publishedAt: new Date(), moderatorNote: null }
        : { status: 'rejected', publishedAt: null, moderatorNote: decision.note!.trim() },
    });
  }
}
