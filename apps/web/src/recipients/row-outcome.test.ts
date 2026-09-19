import { describe, expect, it } from 'vitest';
import { rowOutcome } from './row-outcome';

const base = {
  checked: true,
  lastFileId: null,
  mailStatus: null,
  changedSinceIssue: false,
} as const;

describe('rowOutcome', () => {
  it('без файла решает галочка', () => {
    expect(rowOutcome({ ...base, checked: false })).toBe('skipped');
    expect(rowOutcome(base)).toBe('pending');
  });

  it('файл без письма — выпущен', () => {
    expect(rowOutcome({ ...base, lastFileId: 'f1' })).toBe('issued');
  });

  it('письмо берёт верх над файлом', () => {
    expect(rowOutcome({ ...base, lastFileId: 'f1', mailStatus: 'queued' })).toBe('queued');
    expect(rowOutcome({ ...base, lastFileId: 'f1', mailStatus: 'sent' })).toBe('sent');
    expect(rowOutcome({ ...base, lastFileId: 'f1', mailStatus: 'delivered' })).toBe('delivered');
    expect(rowOutcome({ ...base, lastFileId: 'f1', mailStatus: 'opened' })).toBe('opened');
  });

  it('отказ адреса и сбой отправки — одно «не дошло»', () => {
    expect(rowOutcome({ ...base, lastFileId: 'f1', mailStatus: 'bounced' })).toBe('failed');
    expect(rowOutcome({ ...base, lastFileId: 'f1', mailStatus: 'failed' })).toBe('failed');
  });

  it('снятая галочка не прячет уже случившуюся доставку', () => {
    expect(rowOutcome({ ...base, checked: false, lastFileId: 'f1', mailStatus: 'opened' })).toBe(
      'opened',
    );
  });

  it('правка после выпуска важнее доставки: на руках устаревший документ', () => {
    expect(
      rowOutcome({ ...base, lastFileId: 'f1', mailStatus: 'delivered', changedSinceIssue: true }),
    ).toBe('changed');
  });
});
