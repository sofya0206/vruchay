import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CURRENT_LAYOUT_SCHEMA_VERSION, SheetLayout } from '@gramota/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { buildS3Key } from '../storage/s3-key';
import { AllowedImage } from '../common/image-type';
import { DEFAULT_COLUMNS } from '../recipients/recipients.service';
import { CreateDocumentDto, ListDocumentsDto, UpdateDocumentDto } from './documents.dto';

/**
 * Все выборки фильтруются по orgId, который приходит из сессии.
 * Чужой документ отдаёт 404, а не 403: ответ «нет доступа» подтвердил бы,
 * что документ с таким идентификатором существует.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(orgId: string, query: ListDocumentsDto) {
    const where: Prisma.DocumentWhereInput = {
      orgId,
      deletedAt: null,
      ...(query.search
        ? { title: { contains: query.search, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          title: true,
          pageWidthMm: true,
          pageHeightMm: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items, total, limit: query.limit, offset: query.offset };
  }

  async create(orgId: string, dto: CreateDocumentDto) {
    // Документ без листа бесполезен, а таблица без колонок «имя» и «почта»
    // не даст ни сгенерировать файл, ни отправить его — создаём всё сразу.
    return this.prisma.document.create({
      data: {
        orgId,
        title: dto.title,
        pageWidthMm: dto.pageWidthMm,
        pageHeightMm: dto.pageHeightMm,
        sheets: {
          create: { position: 0, layout: [], schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION },
        },
        columns: {
          create: DEFAULT_COLUMNS.map((name, position) => ({ name, position })),
        },
      },
      include: {
        sheets: { orderBy: { position: 'asc' } },
        columns: { orderBy: { position: 'asc' } },
      },
    });
  }

  async getOrFail(orgId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, orgId, deletedAt: null },
      include: { sheets: { orderBy: { position: 'asc' } } },
    });
    if (!doc) throw new NotFoundException('Документ не найден');
    return doc;
  }

  async update(orgId: string, documentId: string, dto: UpdateDocumentDto) {
    await this.getOrFail(orgId, documentId);
    return this.prisma.document.update({
      where: { id: documentId },
      data: dto,
      include: { sheets: { orderBy: { position: 'asc' } } },
    });
  }

  /** Мягкое удаление: документ уходит в корзину, файлы остаются доступны по verify-ссылкам. */
  async softDelete(orgId: string, documentId: string) {
    await this.getOrFail(orgId, documentId);
    await this.prisma.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  async restore(orgId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, orgId, deletedAt: { not: null } },
    });
    if (!doc) throw new NotFoundException('Документ не найден');
    await this.prisma.document.update({ where: { id: documentId }, data: { deletedAt: null } });
    return { ok: true };
  }

  async addSheet(orgId: string, documentId: string) {
    const doc = await this.getOrFail(orgId, documentId);
    const position = doc.sheets.length;
    return this.prisma.sheet.create({
      data: { documentId, position, layout: [], schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION },
    });
  }

  async updateSheetLayout(orgId: string, documentId: string, sheetId: string, layout: SheetLayout) {
    await this.getSheetOrFail(orgId, documentId, sheetId);
    return this.prisma.sheet.update({
      where: { id: sheetId },
      data: { layout, schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION },
    });
  }

  async deleteSheet(orgId: string, documentId: string, sheetId: string) {
    const doc = await this.getOrFail(orgId, documentId);
    if (doc.sheets.length <= 1) {
      throw new NotFoundException('Нельзя удалить единственный лист документа');
    }
    await this.getSheetOrFail(orgId, documentId, sheetId);

    // После удаления перенумеровываем листы, чтобы не осталось дыр в позициях.
    await this.prisma.$transaction(async (tx) => {
      await tx.sheet.delete({ where: { id: sheetId } });
      const rest = await tx.sheet.findMany({
        where: { documentId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      await Promise.all(
        rest.map((s, i) => tx.sheet.update({ where: { id: s.id }, data: { position: i } })),
      );
    });
    return { ok: true };
  }

  /** Загрузка фона листа. Тип уже определён по сигнатуре файла в контроллере. */
  async setBackground(
    orgId: string,
    documentId: string,
    sheetId: string,
    body: Buffer,
    image: AllowedImage,
    originalName: string,
  ) {
    const sheet = await this.getSheetOrFail(orgId, documentId, sheetId);
    const previousFileId = sheet.backgroundFileId;

    const file = await this.prisma.file.create({
      data: {
        orgId,
        documentId,
        kind: 'background',
        // Ключ временный: настоящий строится из id, который база выдаёт только сейчас.
        s3Key: '',
        sizeBytes: body.length,
        mime: image.mime,
        // Имя от клиента показываем только в интерфейсе и не используем в пути S3.
        originalName: originalName.slice(0, 255),
      },
    });

    const s3Key = buildS3Key({
      orgId,
      documentId,
      kind: 'background',
      fileId: file.id,
      ext: image.ext,
    });

    await this.storage.put(s3Key, body, image.mime);
    await this.prisma.file.update({ where: { id: file.id }, data: { s3Key } });
    await this.prisma.sheet.update({
      where: { id: sheetId },
      data: { backgroundFileId: file.id },
    });

    if (previousFileId) await this.removeFile(previousFileId);

    return { fileId: file.id, url: await this.storage.presignedGetUrl(s3Key) };
  }

  async backgroundUrl(orgId: string, fileId: string): Promise<string> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, orgId, deletedAt: null },
    });
    if (!file) throw new NotFoundException('Файл не найден');
    return this.storage.presignedGetUrl(file.s3Key);
  }

  private async getSheetOrFail(orgId: string, documentId: string, sheetId: string) {
    const sheet = await this.prisma.sheet.findFirst({
      where: { id: sheetId, documentId, document: { orgId, deletedAt: null } },
    });
    if (!sheet) throw new NotFoundException('Лист не найден');
    return sheet;
  }

  private async removeFile(fileId: string): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return;
    await this.prisma.file.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
    if (file.s3Key) await this.storage.remove(file.s3Key);
  }
}
