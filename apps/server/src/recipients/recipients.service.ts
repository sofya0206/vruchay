import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AddColumnDto, ImportDto, UpdateRowDto } from './recipients.dto';

/** Первые две колонки создаются вместе с документом: по ним работает вся выдача. */
export const DEFAULT_COLUMNS = ['name', 'email'] as const;

@Injectable()
export class RecipientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Проверка принадлежности документа организации — перед любой операцией. */
  private async assertDocument(orgId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('Документ не найден');
    return doc;
  }

  async getTable(orgId: string, documentId: string) {
    await this.assertDocument(orgId, documentId);
    const [columns, rows, checkedCount] = await Promise.all([
      this.prisma.recipientColumn.findMany({
        where: { documentId },
        orderBy: { position: 'asc' },
      }),
      this.prisma.recipientRow.findMany({
        where: { documentId },
        orderBy: { position: 'asc' },
        take: 10000,
      }),
      this.prisma.recipientRow.count({ where: { documentId, checked: true } }),
    ]);
    return { columns, rows, checkedCount };
  }

  async addColumn(orgId: string, documentId: string, dto: AddColumnDto) {
    await this.assertDocument(orgId, documentId);
    const position = await this.prisma.recipientColumn.count({ where: { documentId } });
    try {
      return await this.prisma.recipientColumn.create({
        data: { documentId, name: dto.name, position },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestException(`Колонка «${dto.name}» уже есть`);
      }
      throw err;
    }
  }

  async renameColumn(orgId: string, documentId: string, columnId: string, name: string) {
    await this.assertDocument(orgId, documentId);
    const column = await this.prisma.recipientColumn.findFirst({
      where: { id: columnId, documentId },
    });
    if (!column) throw new NotFoundException('Колонка не найдена');

    // Переименование колонки должно переносить значения во всех строках,
    // иначе данные потеряются: они хранятся по имени, а не по идентификатору.
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.recipientColumn.update({ where: { id: columnId }, data: { name } });
      const rows = await tx.recipientRow.findMany({ where: { documentId } });
      await Promise.all(
        rows.map((row) => {
          const data = { ...(row.data as Record<string, string>) };
          if (!(column.name in data)) return null;
          data[name] = data[column.name];
          delete data[column.name];
          return tx.recipientRow.update({ where: { id: row.id }, data: { data } });
        }),
      );
      return updated;
    });
  }

  async deleteColumn(orgId: string, documentId: string, columnId: string) {
    await this.assertDocument(orgId, documentId);
    const column = await this.prisma.recipientColumn.findFirst({
      where: { id: columnId, documentId },
    });
    if (!column) throw new NotFoundException('Колонка не найдена');

    await this.prisma.$transaction(async (tx) => {
      await tx.recipientColumn.delete({ where: { id: columnId } });
      const rest = await tx.recipientColumn.findMany({
        where: { documentId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      await Promise.all(
        rest.map((c, i) => tx.recipientColumn.update({ where: { id: c.id }, data: { position: i } })),
      );
    });
    return { ok: true };
  }

  async addRow(orgId: string, documentId: string, data: Record<string, string>) {
    await this.assertDocument(orgId, documentId);
    const position = await this.prisma.recipientRow.count({ where: { documentId } });
    return this.prisma.recipientRow.create({ data: { documentId, position, data } });
  }

  async updateRow(orgId: string, documentId: string, rowId: string, dto: UpdateRowDto) {
    await this.assertDocument(orgId, documentId);
    const row = await this.prisma.recipientRow.findFirst({ where: { id: rowId, documentId } });
    if (!row) throw new NotFoundException('Строка не найдена');

    return this.prisma.recipientRow.update({
      where: { id: rowId },
      data: {
        // Правки приходят по одной ячейке, поэтому объединяем с существующими данными.
        ...(dto.data ? { data: { ...(row.data as object), ...dto.data } } : {}),
        ...(dto.checked === undefined ? {} : { checked: dto.checked }),
      },
    });
  }

  async deleteRow(orgId: string, documentId: string, rowId: string) {
    await this.assertDocument(orgId, documentId);
    const row = await this.prisma.recipientRow.findFirst({ where: { id: rowId, documentId } });
    if (!row) throw new NotFoundException('Строка не найдена');
    await this.prisma.recipientRow.delete({ where: { id: rowId } });
    return { ok: true };
  }

  async setChecked(orgId: string, documentId: string, checked: boolean, rowIds?: string[]) {
    await this.assertDocument(orgId, documentId);
    const where: Prisma.RecipientRowWhereInput = {
      documentId,
      ...(rowIds?.length ? { id: { in: rowIds } } : {}),
    };
    const { count } = await this.prisma.recipientRow.updateMany({ where, data: { checked } });
    return { updated: count };
  }

  /** Загрузка разобранной таблицы: колонки создаются по мере необходимости. */
  async import(orgId: string, documentId: string, dto: ImportDto) {
    await this.assertDocument(orgId, documentId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.mode === 'replace') {
        await tx.recipientRow.deleteMany({ where: { documentId } });
      }

      const existing = await tx.recipientColumn.findMany({ where: { documentId } });
      const known = new Map(existing.map((c) => [c.name, c]));
      let nextPosition = existing.length;

      for (const name of dto.columns) {
        if (known.has(name)) continue;
        const created = await tx.recipientColumn.create({
          data: { documentId, name, position: nextPosition++ },
        });
        known.set(name, created);
      }

      const startPosition = await tx.recipientRow.count({ where: { documentId } });
      const rows = dto.rows.map((values, i) => ({
        documentId,
        position: startPosition + i,
        data: Object.fromEntries(
          dto.columns.map((name, colIndex) => [name, values[colIndex] ?? '']),
        ),
      }));

      if (rows.length) await tx.recipientRow.createMany({ data: rows });
      return { imported: rows.length, columns: [...known.keys()] };
    });
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
