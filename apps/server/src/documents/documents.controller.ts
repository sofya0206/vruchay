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
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { detectImageType, MAX_IMAGE_BYTES } from '../common/image-type';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { SessionUser } from '../auth/auth.service';
import { DocumentsService } from './documents.service';
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

@Controller('documents')
@UseGuards(AuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

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
  remove(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.documents.softDelete(user.orgId, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.documents.restore(user.orgId, id);
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
