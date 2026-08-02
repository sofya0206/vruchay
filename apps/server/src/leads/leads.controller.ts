import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { uuidSchema } from '../documents/documents.dto';
import { LeadsService } from './leads.service';
import { leadSchema, LeadDto, leadStatusSchema, LeadStatusDto } from './leads.dto';

const uuidParam = new ZodValidationPipe(uuidSchema);

/** Приём заявок с посадочной страницы. Сессии нет — это открытая форма. */
@Controller('v1/leads')
@UseGuards(ThrottleGuard)
export class LeadsPublicController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  // Заявка от организации — событие редкое; пять за десять минут с одного
  // адреса это уже не заявки, а перебор формы.
  @Throttle({ max: 5, timeWindow: '10 minutes' })
  create(@Body(new ZodValidationPipe(leadSchema)) dto: LeadDto, @Req() req: FastifyRequest) {
    return this.leads.create(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer,
    });
  }
}

/** Разбор заявок в кабинете. Видит только владелец сервиса. */
@Controller('leads')
@UseGuards(AuthGuard, RolesGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @Roles('owner', 'admin')
  list(@Query('status') status?: string) {
    return this.leads.list(status);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  update(
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(leadStatusSchema)) dto: LeadStatusDto,
  ) {
    return this.leads.update(id, dto);
  }
}
