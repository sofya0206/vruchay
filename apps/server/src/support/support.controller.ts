import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { AuthGuard } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { SupportService } from './support.service';

const uuidParam = new ZodValidationPipe(uuidSchema);

const createSchema = z.object({
  subject: z.string().trim().min(3, 'Опишите тему хотя бы тремя буквами').max(200),
  text: z.string().trim().min(10, 'Расскажите подробнее — так мы ответим быстрее').max(5000),
});

const replySchema = z.object({
  text: z.string().trim().min(1, 'Пустое сообщение отправить нельзя').max(5000),
});

/**
 * Обращения в поддержку.
 *
 * Открыто любому сотруднику: беда случается у того, кто работает,
 * а не у того, кто владеет учётной записью. Частота ограничена —
 * форма отправляет письмо нам, и без предела ею завалили бы почту.
 */
@Controller('support/tickets')
@UseGuards(AuthGuard, ThrottleGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.support.listTickets(user.orgId);
  }

  @Get(':id')
  ticket(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.support.ticket(user.orgId, id);
  }

  @Post()
  @Throttle({ max: 10, timeWindow: '1 hour' })
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createSchema)) dto: z.infer<typeof createSchema>,
  ) {
    return this.support.createTicket(user.orgId, user.userId, dto.subject, dto.text);
  }

  @Post(':id/messages')
  @Throttle({ max: 30, timeWindow: '1 hour' })
  reply(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(replySchema)) dto: z.infer<typeof replySchema>,
  ) {
    return this.support.reply(user.orgId, user.userId, id, dto.text);
  }

  @Post(':id/close')
  close(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.support.closeTicket(user.orgId, id);
  }
}

/** Дорожная карта: читают все вошедшие, голос — один на организацию. */
@Controller('roadmap')
@UseGuards(AuthGuard)
export class RoadmapController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.support.roadmap(user.orgId);
  }

  @Post(':id/vote')
  vote(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.support.vote(user.orgId, id);
  }

  @Delete(':id/vote')
  unvote(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.support.unvote(user.orgId, id);
  }
}
