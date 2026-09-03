import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { PublicOrgService } from './public-org.service';

const slugParam = new ZodValidationPipe(
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{1,50}$/, 'Некорректный адрес'),
);

const searchSchema = z
  .object({
    code: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(200).optional(),
  })
  .refine((v) => Boolean(v.code) !== Boolean(v.name), 'Укажите номер документа или имя');
type SearchDto = z.infer<typeof searchSchema>;

/**
 * Публичный реестр эмитента — без входа, снаружи.
 *
 * Нарочно не имеет ничего общего с `RegistryController`: тот под
 * `AuthGuard` и показывает сотрудникам всё, этот открыт всем и показывает
 * только то, что эмитент явно разрешил. Общий модуль превратил бы
 * разницу в правах в разницу в одном условии — и однажды оно бы пропало.
 *
 * Ограничение частоты стоит на каждом маршруте: страница организации
 * дёшева, но перебор адресов не должен быть бесплатным, а поиск по ФИО —
 * это перебор чужих фамилий, и ему предел втрое строже.
 */
@Controller('v1/public/org')
@UseGuards(ThrottleGuard)
export class PublicOrgController {
  constructor(private readonly publicOrg: PublicOrgService) {}

  @Get(':slug')
  @Throttle({ max: 60, timeWindow: '1 minute' })
  page(@Param('slug', slugParam) slug: string) {
    return this.publicOrg.page(slug);
  }

  @Get(':slug/search')
  @Throttle({ max: 20, timeWindow: '1 minute' })
  search(
    @Param('slug', slugParam) slug: string,
    @Query(new ZodValidationPipe(searchSchema)) query: SearchDto,
  ) {
    if (query.code) return this.publicOrg.findByCode(slug, query.code);
    if (query.name) return this.publicOrg.searchByName(slug, query.name);
    throw new NotFoundException('Документ не найден');
  }
}
