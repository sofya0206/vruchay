import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { AuditActor } from '../audit/actor.decorator';
import { AuditService, type Actor } from '../audit/audit.service';
import { MailService } from './mail.service';
import { MailProcessor } from './mail.processor';

const uuidParam = new ZodValidationPipe(uuidSchema);

const addDomainSchema = z.object({ domain: z.string().trim().min(4).max(253) });
/**
 * Правка отправителя: только то, что организация пишет о себе сама.
 * Адрес и домен не меняются — они подтверждены DNS.
 */
const updateSenderSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Укажите имя отправителя').max(100),
    replyTo: z.string().trim().max(254),
    signature: z.string().trim().max(2000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Нечего обновлять');

const addSenderSchema = z.object({
  domainId: z.string().uuid(),
  email: z.string().trim().email('Некорректный адрес').max(254),
  displayName: z.string().trim().min(1, 'Укажите имя отправителя').max(100),
});
const templateSchema = z.object({
  senderId: z.string().uuid().optional(),
  subject: z.string().trim().min(1, 'Введите тему письма').max(300),
  bodyHtml: z.string().max(50_000),
  attachGeneratedFile: z.boolean().default(true),
});

@Controller('mail')
@UseGuards(AuthGuard, RolesGuard)
export class MailController {
  constructor(
    private readonly mail: MailService,
    private readonly processor: MailProcessor,
    private readonly audit: AuditService,
  ) {}

  @Get('domains')
  listDomains(@CurrentUser() user: SessionUser) {
    return this.mail.listDomains(user.orgId);
  }

  @Post('domains')
  @Roles('owner', 'admin')
  addDomain(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(addDomainSchema)) dto: { domain: string },
  ) {
    return this.mail.addDomain(user.orgId, dto.domain);
  }

  @Post('domains/:id/check')
  @Roles('owner', 'admin')
  checkDomain(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.mail.checkDomain(user.orgId, id);
  }

  @Delete('domains/:id')
  @Roles('owner', 'admin')
  deleteDomain(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.mail.deleteDomain(user.orgId, id);
  }

  @Post('senders')
  @Roles('owner', 'admin')
  addSender(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(addSenderSchema))
    dto: { domainId: string; email: string; displayName: string },
  ) {
    return this.mail.addSender(user.orgId, dto.domainId, dto.email, dto.displayName);
  }

  @Patch('senders/:id')
  @Roles('owner', 'admin')
  updateSender(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(updateSenderSchema)) dto: z.infer<typeof updateSenderSchema>,
  ) {
    return this.mail.updateSender(user.orgId, id, dto);
  }

  /**
   * Проверочное письмо — только на собственный адрес нажавшего.
   * Адрес берём из сессии, а не из тела запроса: иначе кнопка
   * «проверить» стала бы способом слать что угодно кому угодно
   * с подтверждённого домена.
   */
  @Post('senders/:id/test')
  @Roles('owner', 'admin')
  sendTest(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.mail.sendTest(user.orgId, id, user.email);
  }

  @Delete('senders/:id')
  @Roles('owner', 'admin')
  deleteSender(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.mail.deleteSender(user.orgId, id);
  }

  @Get('templates/:documentId')
  getTemplate(
    @CurrentUser() user: SessionUser,
    @Param('documentId', uuidParam) documentId: string,
  ) {
    return this.mail.getTemplate(user.orgId, documentId);
  }

  @Post('templates/:documentId')
  saveTemplate(
    @CurrentUser() user: SessionUser,
    @Param('documentId', uuidParam) documentId: string,
    @Body(new ZodValidationPipe(templateSchema)) dto: z.infer<typeof templateSchema>,
  ) {
    return this.mail.saveTemplate(user.orgId, documentId, dto);
  }

  @Post('send/:documentId')
  async send(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('documentId', uuidParam) documentId: string,
  ) {
    const result = await this.mail.queueForDocument(user.orgId, documentId);
    await Promise.all(result.emailIds.map((id) => this.processor.enqueue(id)));

    // Рассылка — действие наружу и необратимое: отправленное письмо
    // не отзывается. Журнал должен помнить, кто её запустил.
    await this.audit.record({
      actor,
      action: 'mail.send',
      summary: `Разослано писем участникам: ${result.queued}`,
      targetType: 'document',
      targetId: documentId,
      meta: { queued: result.queued, skipped: result.skipped.length },
    });

    return { queued: result.queued, skipped: result.skipped };
  }

  @Get('emails')
  listEmails(
    @CurrentUser() user: SessionUser,
    @Query('documentId') documentId?: string,
  ) {
    const parsed = documentId ? uuidSchema.safeParse(documentId) : null;
    return this.mail.listEmails(user.orgId, parsed?.success ? parsed.data : undefined);
  }
}
