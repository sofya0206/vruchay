import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ThrottleGuard } from '../common/throttle.guard';
import { Throttle } from '../common/throttle.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { AuditActor } from '../audit/actor.decorator';
import { AuditService, type Actor } from '../audit/audit.service';
import { ValidationService } from './validation.service';
import {
  excludeSchema,
  fixManySchema,
  validateBatchSchema,
  type ExcludeDto,
  type FixManyDto,
  type ValidateBatchDto,
} from './validation.dto';

const uuidParam = new ZodValidationPipe(uuidSchema);

/**
 * Проверка списка перед выпуском.
 *
 * POST, а не GET, хотя ничего не меняет: разбор десяти тысяч строк не должен
 * попадать ни в кэш браузера, ни в журналы прокси — в нём фамилии и адреса
 * живых людей.
 */
@Controller('documents/:id/validation')
@UseGuards(AuthGuard, ThrottleGuard)
export class ValidationController {
  constructor(
    private readonly validation: ValidationService,
    private readonly audit: AuditService,
  ) {}

  /*
   * Ограничение частоты, хотя маршрут и за входом.
   *
   * Разбор пяти тысяч строк — самая тяжёлая счётная работа во всём сервисе,
   * и делается она в том же единственном потоке, который отвечает всем
   * остальным. Десяток таких запросов подряд подвесил бы кабинет всем
   * организациям сразу. Предел с большим запасом к живой работе: перепроверка
   * идёт после каждой правки, но не сорок раз за пять минут.
   */
  @Throttle({ max: 40, timeWindow: '5 minutes' })
  @Post()
  validate(
    @CurrentUser() user: SessionUser,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(validateBatchSchema)) dto: ValidateBatchDto,
  ) {
    return this.validation.validate(user.orgId, id, dto);
  }

  // Правка может тронуть пять тысяч строк одной транзакцией — тоже
  // не то, что стоит позволять повторять без счёта.
  @Throttle({ max: 80, timeWindow: '5 minutes' })
  @Post('fix')
  async fix(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(fixManySchema)) dto: FixManyDto,
  ) {
    const result = await this.validation.fix(user.orgId, id, dto);

    // Правка сотен строк одним нажатием — то, о чём потом спрашивают
    // «кто это сделал». В журнал идут числа и имена колонок, но не значения:
    // в них фамилии и адреса участников.
    await this.audit.record({
      actor,
      action: 'validation.fix',
      summary: `Исправлено строк: ${result.updated}`,
      targetType: 'document',
      targetId: id,
      meta: {
        updated: result.updated,
        columns: [...new Set(dto.fixes.map((f) => f.column))],
      },
    });

    return result;
  }

  @Throttle({ max: 80, timeWindow: '5 minutes' })
  @Post('exclude')
  async exclude(
    @CurrentUser() user: SessionUser,
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(excludeSchema)) dto: ExcludeDto,
  ) {
    const result = await this.validation.exclude(user.orgId, id, dto);

    await this.audit.record({
      actor,
      action: 'validation.exclude',
      summary: `Снята отметка со строк: ${result.excluded}`,
      targetType: 'document',
      targetId: id,
      meta: { excluded: result.excluded },
    });

    return result;
  }
}
