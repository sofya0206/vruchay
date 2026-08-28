import { describe, expect, it } from 'vitest';
import { substituteForRow, keepVariable } from '@gramota/shared';
import { canvasPreviewData } from './preview-data';

const ISSUED_AT = new Date('2026-08-04T12:00:00Z');

/** Так же, как холст редактора: подставить, а ненайденное оставить токеном. */
const onCanvas = (text: string, data: Record<string, string>) =>
  substituteForRow(text, data, keepVariable);

describe('значения для холста редактора', () => {
  it('подставляет сведения о мероприятии', () => {
    const data = canvasPreviewData({
      event: {
        name: 'Первенство области по плаванию',
        date: '17–19 июня 2026 года',
        place: 'г. Челябинск',
        hours: '72 часа',
      },
      issuedAt: ISSUED_AT,
    });

    expect(onCanvas('%event', data)).toBe('Первенство области по плаванию');
    expect(onCanvas('%event_date', data)).toBe('17–19 июня 2026 года');
    expect(onCanvas('%event_place', data)).toBe('г. Челябинск');
    expect(onCanvas('%hours', data)).toBe('72 часа');
  });

  it('оставляет токен там, где значения ещё нет', () => {
    const data = canvasPreviewData({ event: { name: '' }, issuedAt: ISSUED_AT });

    // Пустое место на листе читалось бы как сломавшийся блок, а «%event»
    // прямо показывает, что поле «Название мероприятия» не заполнено.
    expect(onCanvas('%event', data)).toBe('%event');
    expect(onCanvas('%code', data)).toBe('%code');
  });

  it('без списка получателей показывает образец, а с ним — первую строку', () => {
    const sample = canvasPreviewData({ issuedAt: ISSUED_AT });
    expect(onCanvas('%name', sample)).toBe('Кузьмина-Караваева Анна');

    const real = canvasPreviewData({
      row: { name: 'Иванов Пётр Ильич', place: '2' },
      issuedAt: ISSUED_AT,
    });
    expect(onCanvas('%name', real)).toBe('Иванов Пётр Ильич');
    expect(onCanvas('%place_word', real)).toBe('второе');
  });

  it('склоняет и раскрывает парные формы — как при печати', () => {
    const data = canvasPreviewData({ row: { name: 'Кузьмина Анна' }, issuedAt: ISSUED_AT });
    // Пара пишется «мужская|женская», имя женское — берётся вторая форма.
    expect(onCanvas('Награждён|награждена %name_dat', data)).toBe('награждена Кузьминой Анне');
  });

  it('подставляет организацию, дату и номер', () => {
    const data = canvasPreviewData({ orgName: 'Федерация плавания', issuedAt: ISSUED_AT });
    expect(onCanvas('%org, %date, №%number', data)).toBe('Федерация плавания, 04.08.2026, №1');
  });
});
