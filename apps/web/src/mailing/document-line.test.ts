import { describe, expect, it } from 'vitest';
import { documentLine } from './document-line';
import type { DocumentSummary } from '../api/types';

/*
 * Строка материала в списке рассылки — не украшение. По ней человек
 * выбирает, кому уйдут письма, а отправленное письмо не отзывается.
 * Поэтому проверяем именно то, что можно испортить незаметно: молчание
 * о незаполненном мероприятии, «0 получателей» и склонение числа.
 */

const base: DocumentSummary = {
  id: 'd1',
  title: 'Грамота за место',
  pageWidthMm: 297,
  pageHeightMm: 210,
  createdAt: '2026-08-28T09:00:00.000Z',
  updatedAt: '2026-08-28T09:00:00.000Z',
};

const now = new Date('2026-08-30T09:00:00.000Z');

describe('строка материала в рассылке', () => {
  it('собирает мероприятие, дату и число получателей', () => {
    const line = documentLine(
      { ...base, eventName: 'Первенство округа', eventDate: '17 июня 2026', recipientCount: 128 },
      now,
    );
    expect(line).toBe('Первенство округа · 17 июня 2026 · создан 28.08 · 128 получателей');
  });

  it('о незаполненном мероприятии говорит вслух', () => {
    // Пустая строка была бы неотличима от «мероприятие есть, но не показано».
    expect(documentLine({ ...base, recipientCount: 1 }, now)).toContain('мероприятие не указано');
  });

  it('пустой список получателей не выдаёт за наличие людей', () => {
    expect(documentLine({ ...base, recipientCount: 0 }, now)).toContain(
      'список получателей пуст',
    );
  });

  it('склоняет получателей по числу', () => {
    expect(documentLine({ ...base, recipientCount: 1 }, now)).toContain('1 получатель');
    expect(documentLine({ ...base, recipientCount: 3 }, now)).toContain('3 получателя');
    expect(documentLine({ ...base, recipientCount: 11 }, now)).toContain('11 получателей');
  });

  it('у материала прошлого года дата создания с годом', () => {
    expect(documentLine({ ...base, createdAt: '2025-12-31T09:00:00.000Z' }, now)).toContain(
      'создан 31.12.2025',
    );
  });
});
