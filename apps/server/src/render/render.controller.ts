import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { Env } from '../config/env';
import { verifyRenderToken } from './render-token';

/**
 * Данные для страницы, которую печатает в PDF браузер воркера.
 *
 * Сессии здесь нет: доступ даёт подписанный токен на одну строку.
 * Поэтому наружу отдаём ровно то, что нужно для отрисовки одного листа,
 * и ничего о документе, организации или соседних получателях.
 */
@Controller('render')
export class RenderController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get(':token')
  async getRenderData(@Param('token') token: string) {
    const payload = verifyRenderToken(
      token,
      this.config.get('SESSION_SECRET', { infer: true }),
      Math.floor(Date.now() / 1000),
    );
    if (!payload) throw new NotFoundException('Ссылка недействительна');

    const row = await this.prisma.recipientRow.findFirst({
      where: { id: payload.rowId, document: { jobs: { some: { id: payload.jobId } } } },
      include: {
        document: {
          include: { sheets: { orderBy: { position: 'asc' }, include: { background: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException('Ссылка недействительна');

    const doc = row.document;
    const sheets = await Promise.all(
      doc.sheets.map(async (sheet) => ({
        layout: sheet.layout,
        backgroundUrl: sheet.background
          ? await this.storage.presignedGetUrl(sheet.background.s3Key)
          : null,
      })),
    );

    return {
      pageWidthMm: doc.pageWidthMm,
      pageHeightMm: doc.pageHeightMm,
      sheets,
      data: row.data,
    };
  }
}
