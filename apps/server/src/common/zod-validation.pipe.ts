import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Единственная точка входа для тела запроса: без Zod-схемы данные не принимаются.
 * Клиенту возвращается только список полей и понятных сообщений — без внутренних
 * подробностей схемы и без эха неожиданных значений.
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Проверьте правильность заполнения полей',
        errors: result.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
