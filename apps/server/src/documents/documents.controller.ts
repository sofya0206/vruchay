import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { detectImageType, MAX_IMAGE_BYTES } from '../common/image-type';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { SessionUser } from '../auth/auth.service';
import { AuditActor } from '../audit/actor.decorator';
import { AuditService, type Actor } from '../audit/audit.service';
import { DocumentsService } from './documents.service';
import { RegistryService } from './registry.service';
import {
  createDocumentSchema,
  CreateDocumentDto,
  listDocumentsSchema,
  ListDocumentsDto,
  updateDocumentSchema,
  UpdateDocumentDto,
  updateSheetSchema,
  UpdateSheetDto,
  uuidSchema,
} from './documents.dto';

const uuidParam = new ZodValidationPipe(uuidSchema);

const revokeSchema = z.object({ revoked: z.boolean() });
type RevokeDto = z.infer<typeof revokeSchema>;

@Controller('documents')
@UseGuards(AuthGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly registry: RegistryService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Реестр выданных документов.
   *
   * Отдельный маршрут, а не поле в карточке документа: реестр нужен целиком
   * и редко, а карточка — постоянно. Складывать их вместе значило бы тянуть
   * сотни строк выдач при каждом открытии редактора.
   */
  @Get(':id/registry')
  registryList(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.registry.list(user.orgId, id);
  }

  /**
   * Отозвать проверку выданного документа или вернуть её.
   *
   * Только владелец и управляющий: отзыв означает, что предъявленная
   * бумага перестаёт подтверждаться, — это решение организации, а не
   * того сотрудника, который её выпустил.
   */
  @Post(':id/registry/:fileId/revoke')
  @Roles('owner', 'admin')
  async setRevoked(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
    @Param('fileId', uuidParam) fileId: string,
    @Body(new ZodValidationPipe(revokeSchema)) dto: RevokeDto,
  ) {
    const result = await this.registry.setRevoked(user.orgId, id, fileId, dto.revoked);
    await this.audit.record({
      actor,
      action: dto.revoked ? 'verify.revoke' : 'verify.restore',
      summary: dto.revoked
        ? `Отозвана проверка документа${result.name ? ` — ${result.name}` : ''}`
        : `Проверка документа возвращена${result.name ? ` — ${result.name}` : ''}`,
      targetType: 'file',
      targetId: fileId,
      meta: { publicId: result.publicId },
    });
    return result;
  }

  /** Тот же реестр таблицей: федерации ведут отчётность в Excel. */
  @Get(':id/registry.csv')
  async registryCsv(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const csv = await this.registry.csv(user.orgId, id);
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="registry-${id}.csv"`);
    return csv;
  }

  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(listDocumentsSchema)) query: ListDocumentsDto,
  ) {
    return this.documents.list(user.orgId, query);
  }

  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createDocumentSchema)) dto: CreateDocumentDto,
  ) {
    return this.documents.create(user.orgId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.documents.getOrFail(user.orgId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(updateDocumentSchema)) dto: UpdateDocumentDto,
  ) {
    return this.documents.update(user.orgId, id, dto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
  ) {
    const doc = await this.documents.softDelete(user.orgId, id);
    await this.audit.record({
      actor,
      action: 'document.trash',
      summary: `Материал «${doc.title}» отправлен в корзину`,
      targetType: 'document',
      targetId: id,
    });
    return doc;
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.documents.restore(user.orgId, id);
  }

  /** Удалить из корзины насовсем. Только владелец: отменить это нечем. */
  @Delete(':id/purge')
  @Roles('owner')
  async purge(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
  ) {
    const result = await this.documents.purge(user.orgId, id);
    // Именно это действие журнал обязан помнить: вместе с материалом
    // уничтожаются выданные файлы, и восстановить их нечем.
    await this.audit.record({
      actor,
      action: 'document.purge',
      summary: `Материал «${result.title}» удалён навсегда вместе с выданными файлами`,
      targetType: 'document',
      targetId: id,
    });
    return result;
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.documents.duplicate(user.orgId, id);
  }

  @Post(':id/sheets')
  addSheet(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.documents.addSheet(user.orgId, id);
  }

  @Patch(':id/sheets/:sheetId')
  updateSheet(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Param('sheetId', uuidParam) sheetId: string,
    @Body(new ZodValidationPipe(updateSheetSchema)) dto: UpdateSheetDto,
  ) {
    return this.documents.updateSheetLayout(user.orgId, id, sheetId, dto.layout);
  }

  @Delete(':id/sheets/:sheetId')
  deleteSheet(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Param('sheetId', uuidParam) sheetId: string,
  ) {
    return this.documents.deleteSheet(user.orgId, id, sheetId);
  }

  /**
   * Загрузка фона листа. Тип файла определяется по сигнатуре, а не по заголовку
   * Content-Type и не по расширению из формы — им нельзя доверять.
   */
  @Post(':id/sheets/:sheetId/background')
  async uploadBackground(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Param('sheetId', uuidParam) sheetId: string,
    @Req() req: FastifyRequest,
  ) {
    const part = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
    if (!part) throw new BadRequestException('Файл не передан');

    let body: Buffer;
    try {
      body = await part.toBuffer();
    } catch {
      throw new BadRequestException(
        `Файл слишком большой, максимум ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} МБ`,
      );
    }

    const image = detectImageType(body);
    if (!image) throw new BadRequestException('Поддерживаются только изображения PNG и JPEG');

    return this.documents.setBackground(user.orgId, id, sheetId, body, image, part.filename ?? '');
  }

  @Get('files/:fileId/url')
  fileUrl(@CurrentUser() user: SessionUser, @Param('fileId', uuidParam) fileId: string) {
    return this.documents.backgroundUrl(user.orgId, fileId).then((url) => ({ url }));
  }
}
