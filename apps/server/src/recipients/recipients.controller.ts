import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { parseRecipientFile } from '../import/recipient-file';
import { refineColumns } from '../import/column-names';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { maskFileName, redact } from '../common/redact';
import { AuthGuard } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { RecipientsService } from './recipients.service';
import {
  addColumnSchema,
  AddColumnDto,
  addRowSchema,
  AddRowDto,
  importSchema,
  ImportDto,
  MAX_TABLE_BYTES,
  parseQuerySchema,
  ParseQueryDto,
  renameColumnSchema,
  RenameColumnDto,
  setCheckedSchema,
  SetCheckedDto,
  updateRowSchema,
  UpdateRowDto,
} from './recipients.dto';

const uuidParam = new ZodValidationPipe(uuidSchema);

@Controller('documents/:id/recipients')
@UseGuards(AuthGuard)
export class RecipientsController {
  private readonly logger = new Logger(RecipientsController.name);

  constructor(private readonly recipients: RecipientsService) {}

  /**
   * Разбор загруженного файла: ничего не сохраняет, только показывает,
   * что распознано. Пользователь проверяет сопоставление колонок
   * и подтверждает импорт отдельным запросом.
   */
  @Post('parse')
  async parse(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Query(new ZodValidationPipe(parseQuerySchema)) query: ParseQueryDto,
    @Req() req: FastifyRequest,
  ) {
    await this.recipients.getTable(user.orgId, id);

    const part = await req.file({ limits: { fileSize: MAX_TABLE_BYTES, files: 1 } });
    if (!part) throw new BadRequestException('Файл не передан');

    const filename = part.filename ?? '';
    if (!/\.(xlsx|csv|txt|tsv)$/i.test(filename)) {
      throw new BadRequestException('Поддерживаются файлы Excel (.xlsx) и CSV');
    }

    let buffer: Buffer;
    try {
      buffer = await part.toBuffer();
    } catch {
      throw new BadRequestException(
        `Файл слишком большой, максимум ${Math.round(MAX_TABLE_BYTES / 1024 / 1024)} МБ`,
      );
    }

    try {
      // Уточнение по данным идёт здесь, а не в разборе файла: разбор
      // отвечает за то, что в файле написано, а это — догадка о том,
      // что написанное значит.
      const sheet = await parseRecipientFile(buffer, filename, query.headers);
      return { ...sheet, columns: refineColumns(sheet.columns, sheet.rows) };
    } catch (err) {
      // Внутрь ошибки библиотеки может попасть путь или структура файла —
      // наружу отдаём только понятную формулировку.
      // Имя файла в журнал не пишем: списки называют «Список Ивановых 9А.xlsx».
      this.logger.warn(`Не удалось разобрать файл ${maskFileName(filename)}: ${redact(String(err))}`);
      throw new BadRequestException(
        'Не удалось прочитать файл. Проверьте, что это таблица Excel или CSV и в ней есть строка с названиями колонок',
      );
    }
  }

  @Get()
  getTable(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.recipients.getTable(user.orgId, id);
  }

  @Post('columns')
  addColumn(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(addColumnSchema)) dto: AddColumnDto,
  ) {
    return this.recipients.addColumn(user.orgId, id, dto);
  }

  @Patch('columns/:columnId')
  renameColumn(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Param('columnId', uuidParam) columnId: string,
    @Body(new ZodValidationPipe(renameColumnSchema)) dto: RenameColumnDto,
  ) {
    return this.recipients.renameColumn(user.orgId, id, columnId, dto.name);
  }

  @Delete('columns/:columnId')
  deleteColumn(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Param('columnId', uuidParam) columnId: string,
  ) {
    return this.recipients.deleteColumn(user.orgId, id, columnId);
  }

  @Post('rows')
  addRow(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(addRowSchema)) dto: AddRowDto,
  ) {
    return this.recipients.addRow(user.orgId, id, dto.data);
  }

  @Patch('rows/:rowId')
  updateRow(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Param('rowId', uuidParam) rowId: string,
    @Body(new ZodValidationPipe(updateRowSchema)) dto: UpdateRowDto,
  ) {
    return this.recipients.updateRow(user.orgId, id, rowId, dto);
  }

  @Delete('rows/:rowId')
  deleteRow(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Param('rowId', uuidParam) rowId: string,
  ) {
    return this.recipients.deleteRow(user.orgId, id, rowId);
  }

  @Post('checked')
  setChecked(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(setCheckedSchema)) dto: SetCheckedDto,
  ) {
    return this.recipients.setChecked(user.orgId, id, dto.checked, dto.rowIds);
  }

  @Post('import')
  import(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(importSchema)) dto: ImportDto,
  ) {
    return this.recipients.import(user.orgId, id, dto);
  }
}
