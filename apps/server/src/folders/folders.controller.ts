import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { FoldersService } from './folders.service';
import {
  createFolderSchema,
  CreateFolderDto,
  updateFolderSchema,
  UpdateFolderDto,
} from './folders.dto';

const uuidParam = new ZodValidationPipe(uuidSchema);

/**
 * Папки библиотеки.
 *
 * Роли не ограничиваем: папка — это способ разложить свои материалы,
 * а не право на них. Тот, кто может завести материал, может завести
 * и папку под него.
 */
@Controller('folders')
@UseGuards(AuthGuard, RolesGuard)
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.folders.list(user.orgId);
  }

  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createFolderSchema)) dto: CreateFolderDto,
  ) {
    return this.folders.create(user.orgId, dto.name);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(updateFolderSchema)) dto: UpdateFolderDto,
  ) {
    return this.folders.rename(user.orgId, id, dto.name);
  }

  @Delete(':id')
  remove(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.folders.remove(user.orgId, id);
  }
}
