import { describe, expect, it } from 'vitest';
import {
  formatDate,
  mailLabel,
  mailTone,
  plural,
  retentionLabel,
  stateLabel,
  stateTone,
  verifyLabel,
} from './registry-format';
import { filtersToQuery, emptyFilters } from '../api/registry';

describe('состояние документа', () => {
  it('отзыв и замена — разные слова, а не оттенки одного', () => {
    expect(stateLabel({ state: 'revoked', reissuePending: false })).toBe('Отозван');
    expect(stateLabel({ state: 'replaced', reissuePending: false })).toBe('Заменён');
    expect(stateTone({ state: 'revoked', reissuePending: false })).toBe('error');
    expect(stateTone({ state: 'replaced', reissuePending: false })).toBe('warn');
  });

  it('заказанный перевыпуск — это ещё не замена', () => {
    expect(stateLabel({ state: 'valid', reissuePending: true })).toBe('Перевыпускается');
    expect(stateLabel({ state: 'valid', reissuePending: false })).toBe('Действителен');
  });

  it('отзыв сильнее замены: отозванный не показывается заменённым', () => {
    expect(stateLabel({ state: 'revoked', reissuePending: true })).toBe('Отозван');
  });

  it('истёкший срок — жёлтое предупреждение, а не красный отказ', () => {
    expect(stateLabel({ state: 'expired', reissuePending: false })).toBe('Срок истёк');
    expect(stateTone({ state: 'expired', reissuePending: false })).toBe('warn');
  });
});

describe('состояние письма', () => {
  it('отсутствие письма отличается от неудачной отправки', () => {
    expect(mailLabel(null)).toBe('Не отправлялось');
    expect(mailTone(null)).toBe('neutral');
    expect(mailLabel('failed')).toBe('Ошибка отправки');
    expect(mailTone('failed')).toBe('error');
  });

  it('незнакомое состояние показываем как есть, а не прячем', () => {
    expect(mailLabel('unknown')).toBe('unknown');
  });
});

describe('срок хранения', () => {
  it('пока материал не в корзине, срока нет и выдумывать его нельзя', () => {
    expect(retentionLabel(null)).toBeNull();
  });

  it('склоняет дни, а не пишет «через 2 дней»', () => {
    const at = { trashedAt: '2026-08-01T00:00:00.000Z', purgeAt: '2026-08-08T00:00:00.000Z' };
    expect(retentionLabel({ ...at, daysLeft: 1 })).toBe('Удаление через 1 день');
    expect(retentionLabel({ ...at, daysLeft: 2 })).toBe('Удаление через 2 дня');
    expect(retentionLabel({ ...at, daysLeft: 5 })).toBe('Удаление через 5 дней');
    expect(retentionLabel({ ...at, daysLeft: 11 })).toBe('Удаление через 11 дней');
  });

  it('последний день называет прямо', () => {
    expect(
      retentionLabel({ trashedAt: '2026-08-01', purgeAt: '2026-08-08', daysLeft: 0 }),
    ).toBe('Удаление сегодня ночью');
  });
});

describe('число проверок', () => {
  it('ноль — это не «0 раз», а «ни разу»', () => {
    expect(verifyLabel(0)).toBe('Ни разу не проверяли');
  });

  it('склоняет разы', () => {
    expect(verifyLabel(1)).toBe('Проверяли 1 раз');
    expect(verifyLabel(2)).toBe('Проверяли 2 раза');
    expect(verifyLabel(47)).toBe('Проверяли 47 раз');
    expect(verifyLabel(21)).toBe('Проверяли 21 раз');
  });

  it('одиннадцать не путается с одним', () => {
    expect(plural(11, 'раз', 'раза', 'раз')).toBe('раз');
  });
});

describe('дата выдачи', () => {
  it('показывается по Москве независимо от пояса машины', () => {
    // 31 августа 22:00 UTC — это уже 1 сентября по Москве.
    expect(formatDate('2026-08-31T22:00:00.000Z')).toBe('01.09.2026');
  });
});

describe('строка запроса из отбора', () => {
  it('пустой отбор не отправляет ни одного параметра', () => {
    expect(filtersToQuery(emptyFilters)).toBe('');
  });

  it('пустые поля не превращаются в отбор по пустому значению', () => {
    expect(filtersToQuery({ ...emptyFilters, event: '', search: 'Иванов' })).toBe('search=%D0%98%D0%B2%D0%B0%D0%BD%D0%BE%D0%B2');
  });
});
