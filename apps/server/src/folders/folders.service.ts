import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Папки библиотеки.
 *
 * Все выборки фильтруются по orgId из сессии, чужая папка отдаёт 404, а не
 * 403: ответ «нет доступа» подтвердил бы, что папка с таким идентификатором
 * у кого-то есть.
 */
@Injectable()
export class FoldersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Папки организации с числом материалов внутри — колонка показывает и то и другое. */
  async list(orgId: string) {
    const folders = await this.prisma.documentFolder.findMany({
      where: { orgId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        position: true,
        // Считаем только живые материалы: то, что лежит в корзине,
        // из папки уже ушло, и показывать его в счётчике — врать.
        _count: { select: { documents: { where: { deletedAt: null } } } },
      },
    });

    return folders.map((f) => ({
      id: f.id,
      name: f.name,
      position: f.position,
      count: f._count.documents,
    }));
  }

  async create(orgId: string, name: string) {
    // Новая папка встаёт в конец списка, а не в начало: человек заводит её
    // под то, что делает сейчас, и переставлять ею остальные незачем.
    const last = await this.prisma.documentFolder.findFirst({
      where: { orgId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    try {
      return await this.prisma.documentFolder.create({
        data: { orgId, name, position: (last?.position ?? -1) + 1 },
      });
    } catch (e) {
      throw this.nameTaken(e);
    }
  }

  async rename(orgId: string, id: string, name: string) {
    await this.getOrFail(orgId, id);
    try {
      return await this.prisma.documentFolder.update({ where: { id }, data: { name } });
    } catch (e) {
      throw this.nameTaken(e);
    }
  }

  /**
   * Удаление папки не трогает материалы: связь снимается, и они возвращаются
   * в корень «Моих документов». Это делает сама база (`onDelete: SetNull`),
   * поэтому отдельного обхода документов здесь нет.
   */
  async remove(orgId: string, id: string) {
    const folder = await this.getOrFail(orgId, id);
    await this.prisma.documentFolder.delete({ where: { id } });
    return folder;
  }

  /**
   * Новый порядок папок: место в колонке — это `position` по номеру в списке.
   *
   * Список принимается только целиком и только свой. Чужой идентификатор
   * посреди своих — это не «пропустим лишнее», а попытка узнать, есть ли
   * такая папка у соседней организации; отвечаем 404, как и на прямое
   * обращение к чужой папке. Ровно так же отвечаем на неполный список:
   * расставить половину папок нельзя — остальные встали бы на чужие места.
   *
   * Все обновления идут одной транзакцией: колонка, застрявшая на середине
   * перестановки, показала бы порядок, которого человек не выбирал.
   */
  async reorder(orgId: string, ids: string[]) {
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      throw new BadRequestException('Папка не может стоять в списке дважды');
    }

    const own = await this.prisma.documentFolder.findMany({
      where: { orgId },
      select: { id: true },
    });
    const mine = new Set(own.map((f) => f.id));
    const allMine = ids.every((id) => mine.has(id));
    if (!allMine || ids.length !== own.length) {
      throw new NotFoundException('Папка не найдена');
    }

    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.documentFolder.update({ where: { id }, data: { position } }),
      ),
    );

    return this.list(orgId);
  }

  private async getOrFail(orgId: string, id: string) {
    const folder = await this.prisma.documentFolder.findFirst({
      where: { id, orgId },
      select: { id: true, name: true, position: true },
    });
    if (!folder) throw new NotFoundException('Папка не найдена');
    return folder;
  }

  /** Нарушение уникальности (orgId, name) — это занятое имя, а не сбой. */
  private nameTaken(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('Папка с таким названием уже есть');
    }
    return e;
  }
}
