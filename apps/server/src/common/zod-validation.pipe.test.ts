import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

/*
 * Проверка входных данных.
 *
 * Главное здесь — что человек читает в ответ. Сообщения, написанные
 * в схемах, долго собирались в отдельное поле и не показывались:
 * интерфейс выводит message, а там стояла общая фраза. Пользователь
 * видел «что-то не так» и гадал, что именно.
 */

const meta = { type: 'body' } as const;

function reason(schema: z.ZodType<unknown>, value: unknown): string {
  try {
    new ZodValidationPipe(schema).transform(value, meta);
  } catch (e) {
    const body = (e as BadRequestException).getResponse() as { message: string };
    return body.message;
  }
  throw new Error('ожидался отказ, а его не было');
}

describe('отказ называет причину', () => {
  it('показывает то, что написано в схеме', () => {
    const schema = z.object({ text: z.string().min(40, 'Напишите хотя бы пару предложений') });
    expect(reason(schema, { text: 'Всё ок' })).toBe('Напишите хотя бы пару предложений');
  });

  it('перечисляет несколько причин сразу', () => {
    const schema = z.object({
      name: z.string().min(2, 'Укажите, как вас зовут'),
      role: z.string().min(2, 'Укажите вашу должность'),
    });
    const message = reason(schema, { name: '', role: '' });
    expect(message).toContain('Укажите, как вас зовут');
    expect(message).toContain('Укажите вашу должность');
  });

  it('не вываливает длинный список целиком', () => {
    const schema = z.object({
      a: z.string().min(1, 'первое'),
      b: z.string().min(1, 'второе'),
      c: z.string().min(1, 'третье'),
      d: z.string().min(1, 'четвёртое'),
      e: z.string().min(1, 'пятое'),
    });
    const message = reason(schema, { a: '', b: '', c: '', d: '', e: '' });
    expect(message).toContain('и ещё 2');
    expect(message).not.toContain('пятое');
  });

  it('одинаковые причины не повторяются', () => {
    const schema = z.object({
      a: z.string().min(1, 'Заполните поле'),
      b: z.string().min(1, 'Заполните поле'),
    });
    expect(reason(schema, { a: '', b: '' })).toBe('Заполните поле');
  });
});

describe('поля по-прежнему приходят отдельно', () => {
  it('интерфейс может подсветить конкретное поле', () => {
    const schema = z.object({ email: z.string().email('Некорректный адрес') });
    try {
      new ZodValidationPipe(schema).transform({ email: 'не-адрес' }, meta);
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as {
        errors: { field: string; message: string }[];
      };
      expect(body.errors).toEqual([{ field: 'email', message: 'Некорректный адрес' }]);
    }
  });
});

describe('правильные данные проходят', () => {
  it('возвращает разобранное значение, а не исходное', () => {
    const schema = z.object({ limit: z.coerce.number().int() });
    expect(new ZodValidationPipe(schema).transform({ limit: '25' }, meta)).toEqual({ limit: 25 });
  });
});
