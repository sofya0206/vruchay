import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import * as archiver from 'archiver';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { SessionUser } from '../auth/auth.service';
import { AuditActor } from '../audit/actor.decorator';
import { AuditService, type Actor } from '../audit/audit.service';
import { uuidSchema } from '../documents/documents.dto';
import { StorageService } from '../storage/storage.service';
import { contentDisposition } from '../storage/s3-key';
import { uniqueName } from '../generation/file-name';
import { RegistryService } from './registry.service';
import { RegistryActionsService } from './registry-actions.service';
import { AnalyticsService } from './analytics.service';
import {
  ARCHIVE_MAX_FILES,
  ArchiveDto,
  archiveSchema,
  ListRegistryDto,
  listRegistrySchema,
  parseIds,
  RegistryFilterDto,
  registryFilterSchema,
  ReissueDto,
  reissueSchema,
  ResendDto,
  resendSchema,
  RevokeDto,
  revokeSchema,
  RevokePreviewDto,
  revokePreviewSchema,
} from './registry.dto';

const uuidParam = new ZodValidationPipe(uuidSchema);

/** Сколько строк отдаём в выгрузке таблицей. */
const CSV_MAX_ROWS = 20_000;

/**
 * Реестр выданного и аналитика его жизни.
 *
 * Отдельный раздел, а не вкладка внутри материала: через месяц после
 * мероприятия человек ищет «грамоту Ивановой», не помня, в каком материале
 * она выпускалась, — и именно на этот вопрос старый кабинет ответить
 * не мог.
 *
 * Все выборки идут через `registryWhere`, который первым делом ставит
 * условие по организации. Идентификаторы файлов приходят из запроса,
 * и без этого условия чужой документ отзывался бы по одному его номеру.
 */
@Controller('registry')
@UseGuards(AuthGuard, RolesGuard)
export class RegistryController {
  constructor(
    private readonly registry: RegistryService,
    private readonly actions: RegistryActionsService,
    private readonly analytics: AnalyticsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(listRegistrySchema)) query: ListRegistryDto,
  ) {
    // Внутренняя причина отзыва — только владельцу и управляющему.
    const showInternal = user.role === 'owner' || user.role === 'admin';
    return this.registry.list(user.orgId, query, showInternal);
  }

  @Get('facets')
  facets(@CurrentUser() user: SessionUser) {
    return this.registry.facets(user.orgId);
  }

  @Get('analytics')
  summary(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(registryFilterSchema)) query: RegistryFilterDto,
  ) {
    return this.analytics.summary(user.orgId, query);
  }

  /** Выгрузка того же реестра таблицей: федерации ведут отчётность в Excel. */
  @Get('export.csv')
  async csv(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(registryFilterSchema)) query: RegistryFilterDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const csv = await this.registry.csv(user.orgId, query, CSV_MAX_ROWS);
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', contentDisposition('Реестр выданного.csv'));
    return csv;
  }

  /**
   * Скачать пачкой.
   *
   * Собирается потоком тем же способом, что и архив готового выпуска:
   * класть сотни PDF в память или во временные файлы не нужно.
   */
  @Get('archive')
  async archive(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(archiveSchema)) query: ArchiveDto,
    @Res() reply: FastifyReply,
  ) {
    const ids = parseIds(query.ids);
    const files = await this.registry.filesForArchive(
      user.orgId,
      query,
      ids,
      ARCHIVE_MAX_FILES + 1,
    );

    if (files.length === 0) {
      throw new BadRequestException('По этому отбору нечего скачивать');
    }
    if (files.length > ARCHIVE_MAX_FILES) {
      throw new BadRequestException(
        `Документов слишком много для одного архива: больше ${ARCHIVE_MAX_FILES}. ` +
          `Сузьте отбор — например, по мероприятию или по периоду.`,
      );
    }

    const zip = new archiver.ZipArchive({ zlib: { level: 6 } });
    reply
      .header('content-type', 'application/zip')
      .header('content-disposition', contentDisposition('Реестр — документы.zip'))
      .send(zip);

    const used = new Set<string>();
    for (const file of files) {
      const ext = file.mime === 'image/jpeg' ? 'jpg' : 'pdf';
      zip.append(await this.storage.getStream(file.s3Key), {
        name: uniqueName(used, file.originalName || `Документ.${ext}`),
      });
    }
    await zip.finalize();

    await this.actions.countDownloads(
      user.orgId,
      files.map((f) => f.id),
    );
  }

  /** Один документ — посмотреть или переслать вручную. */
  @Get('files/:fileId/download')
  async download(
    @CurrentUser() user: SessionUser,
    @Param('fileId', uuidParam) fileId: string,
    @Res() reply: FastifyReply,
  ) {
    const [file] = await this.registry.filesForArchive(user.orgId, {}, [fileId], 1);
    if (!file) throw new BadRequestException('Документ не найден');

    const ext = file.mime === 'image/jpeg' ? 'jpg' : 'pdf';
    reply
      .header('content-type', file.mime)
      .header('content-disposition', contentDisposition(file.originalName || `Документ.${ext}`))
      .send(await this.storage.getStream(file.s3Key));

    await this.actions.countDownloads(user.orgId, [file.id]);
  }

  /** Карточка документа: что с ним было и что с ним стало. */
  @Get('files/:fileId')
  detail(@CurrentUser() user: SessionUser, @Param('fileId', uuidParam) fileId: string) {
    const showActors = user.role === 'owner' || user.role === 'admin';
    return this.registry.detail(user.orgId, fileId, showActors);
  }

  /**
   * Отозвать проверку у пачки документов или вернуть её.
   *
   * Только владелец и управляющий: отзыв означает, что предъявленная бумага
   * перестаёт подтверждаться, — это решение организации, а не того
   * сотрудника, который её выпустил.
   */
  @Post('revoke')
  @Roles('owner', 'admin')
  async revoke(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Body(new ZodValidationPipe(revokeSchema)) dto: RevokeDto,
  ) {
    const result = await this.actions.setRevoked(
      user.orgId,
      { fileIds: dto.fileIds, filter: dto.filter },
      dto.revoked,
      {
        expectedCount: dto.expectedCount,
        reasonPublic: dto.reasonPublic,
        reasonInternal: dto.reasonInternal,
      },
    );
    await this.audit.record({
      actor,
      action: dto.revoked ? 'verify.revoke' : 'verify.restore',
      summary: dto.revoked
        ? `Отозвана проверка документов: ${result.changed}` +
          (dto.reasonPublic ? ` — ${dto.reasonPublic}` : '')
        : `Проверка документов возвращена: ${result.changed}`,
      targetType: dto.fileIds ? 'file' : 'document',
      targetId: dto.fileIds?.[0] ?? dto.filter?.documentId,
      // Внутреннюю причину в журнал не пишем: журнал видят все сотрудники,
      // а внутренняя причина — только владелец и управляющий.
      meta: { count: result.changed, byFilter: !dto.fileIds, reasonPublic: dto.reasonPublic ?? '' },
    });
    return result;
  }

  /** Что будет отозвано: число и первые имена — до необратимого действия. */
  @Post('revoke/preview')
  @Roles('owner', 'admin')
  previewRevoke(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(revokePreviewSchema)) dto: RevokePreviewDto,
  ) {
    return this.actions.previewRevoke(user.orgId, dto);
  }

  /**
   * Перевыпустить: выдать новый документ вместо этого.
   *
   * Только владелец и управляющий: перевыпуск создаёт новые документы
   * и списывается с той же квоты, что обычный выпуск.
   */
  @Post('reissue')
  @Roles('owner', 'admin')
  async reissue(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Body(new ZodValidationPipe(reissueSchema)) dto: ReissueDto,
  ) {
    const result = await this.actions.reissue(user.orgId, dto.fileIds);
    if (result.reissued > 0) {
      await this.audit.record({
        actor,
        action: 'registry.reissue',
        summary: `Перевыпущено документов: ${result.reissued}`,
        targetType: 'file',
        targetId: dto.fileIds[0],
        meta: { reissued: result.reissued, jobs: result.jobs.map((j) => j.jobId) },
      });
    }
    return result;
  }

  /** Переотправить письмо с уже выпущенным документом. */
  @Post('resend')
  async resend(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Body(new ZodValidationPipe(resendSchema)) dto: ResendDto,
  ) {
    const result = await this.actions.resend(user.orgId, dto.fileIds);
    if (result.queued > 0) {
      await this.audit.record({
        actor,
        action: 'registry.resend',
        summary: `Переотправлено писем из реестра: ${result.queued}`,
        targetType: 'file',
        targetId: dto.fileIds[0],
        meta: { queued: result.queued, skipped: result.skipped.length },
      });
    }
    return result;
  }
}
