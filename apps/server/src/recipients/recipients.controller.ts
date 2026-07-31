import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
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
  constructor(private readonly recipients: RecipientsService) {}

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
