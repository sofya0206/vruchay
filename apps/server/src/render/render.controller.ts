import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mergeVariables } from '@gramota/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { baseUrl, type Env } from '../config/env';
import { verifyRenderToken } from './render-token';
import { verifyUrl } from '../verify/verify-url';
import { expiresAtFor } from '../verify/expiry';

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
          include: {
            org: { select: { name: true } },
            sheets: { orderBy: { position: 'asc' }, include: { background: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Ссылка недействительна');

    const doc = row.document;
    const issuedAt = new Date();
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
      // Служебные переменные подмешиваем здесь, а не в макете: у страницы
      // печати нет ни часов в нужном поясе, ни названия организации,
      // ни порядкового номера строки.
      data: mergeVariables(row.data as Record<string, string>, {
        issuedAt,
        number: row.position + 1,
        // Тем же правилом, что и воркер при записи файла: на бумаге
        // и на странице проверки должна стоять одна дата.
        expiresAt: expiresAtFor(issuedAt, doc),
        // На бумагу (%code) идёт короткий код, когда он есть: его и будут
        // диктовать по телефону. UUID остаётся только у старых выпусков.
        publicId: payload.code ?? payload.publicId ?? null,
        orgName: doc.org?.name,
        event: {
          name: doc.eventName,
          date: doc.eventDate,
          place: doc.eventPlace,
          hours: doc.eventHours,
        },
      }),
      // Адрес проверки этого экземпляра — для QR на листе. Собираем из
      // публичного адреса сервиса, а не из адреса запроса: печать идёт
      // по внутреннему адресу контейнера, и он попал бы в код на бумаге.
      verifyUrl:
        doc.verifyEnabled && payload.publicId
          ? verifyUrl(baseUrl(this.config.get('PUBLIC_URL', { infer: true })), {
              publicId: payload.publicId,
              publicCode: payload.code ?? null,
            })
          : null,
    };
  }
}
