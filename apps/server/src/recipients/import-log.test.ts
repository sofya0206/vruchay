import { describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { RecipientsController } from './recipients.controller';

/*
 * Персональные данные не попадают в журнал — правило проекта без исключений.
 *
 * Списки участников называют по-человечески: «Список Ивановых 9А.xlsx»,
 * «Победители Петров и Сидоров.csv». Имя такого файла — персональные данные,
 * а писалось оно в журнал целиком при каждом сбое разбора. Проверяем не
 * функцию маскирования (её проверяет redact.test.ts), а само место записи:
 * дефект был именно в том, что маскирование к нему не применили.
 */

const FILENAME = 'Список Ивановых 9А.xlsx';

/** Запрос с непригодным для разбора файлом — разбор на нём обязан упасть. */
function requestWithBrokenFile() {
  return {
    file: async () => ({
      filename: FILENAME,
      toBuffer: async () => Buffer.from('это не таблица'),
    }),
  };
}

describe('журнал разбора загруженного файла', () => {
  it('не пишет имя файла, но оставляет расширение', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const recipients = { getTable: async () => ({}) };
    const controller = new RecipientsController(recipients as never);

    await expect(
      controller.parse(
        { orgId: 'org' } as never,
        'doc',
        { headers: true } as never,
        requestWithBrokenFile() as never,
      ),
    ).rejects.toThrow(/Не удалось прочитать файл/);

    expect(warn).toHaveBeenCalled();
    const written = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(written).not.toContain('Ивановых');
    expect(written).not.toContain(FILENAME);
    // Расширение остаётся: им объясняется большая часть таких сбоев.
    expect(written).toContain('.xlsx');
    warn.mockRestore();
  });
});
