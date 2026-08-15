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
      const errors = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));

      throw new BadRequestException({
        // Сообщение собирается из самих причин, а не остаётся общей фразой.
        // Раньше здесь было «Проверьте правильность заполнения полей»:
        // подробности уходили в errors, а интерфейс показывает message —
        // и человек видел, что что-то не так, но не что именно. Все
        // написанные в схемах пояснения при этом пропадали впустую.
        message: summarize(errors),
        errors,
      });
    }
    return result.data;
  }
}

/** Не больше трёх причин: длинное перечисление никто не дочитывает. */
function summarize(errors: { field: string; message: string }[]): string {
  const messages = [...new Set(errors.map((e) => e.message).filter(Boolean))];
  if (messages.length === 0) return 'Проверьте правильность заполнения полей';

  const shown = messages.slice(0, 3).join('; ');
  return messages.length > 3 ? `${shown} — и ещё ${messages.length - 3}` : shown;
}
