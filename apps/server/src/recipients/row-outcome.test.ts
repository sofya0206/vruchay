import { describe, expect, it } from 'vitest';
import { changedSinceIssue, lastMailByRow } from './row-outcome';

describe('lastMailByRow', () => {
  const rows = [
    { id: 'r1', lastFileId: 'f1' },
    { id: 'r2', lastFileId: 'f2-new' },
    { id: 'r3', lastFileId: null },
  ];

  it('берёт последнее письмо строки', () => {
    const mail = lastMailByRow(rows, [
      { rowId: 'r1', fileId: 'f1', status: 'bounced' },
      { rowId: 'r1', fileId: 'f1', status: 'delivered' },
    ]);
    expect(mail.get('r1')).toBe('delivered');
  });

  it('письмо о прежнем файле не считается: новый документ ещё не отправлен', () => {
    const mail = lastMailByRow(rows, [{ rowId: 'r2', fileId: 'f2-old', status: 'opened' }]);
    expect(mail.has('r2')).toBe(false);
  });

  it('письмо без вложения относится к строке целиком', () => {
    const mail = lastMailByRow(rows, [{ rowId: 'r3', fileId: null, status: 'sent' }]);
    expect(mail.get('r3')).toBe('sent');
  });

  it('письма чужих и удалённых строк пропускает', () => {
    const mail = lastMailByRow(rows, [
      { rowId: null, fileId: 'f1', status: 'sent' },
      { rowId: 'gone', fileId: null, status: 'sent' },
    ]);
    expect(mail.size).toBe(0);
  });
});

describe('changedSinceIssue', () => {
  it('правка значения после выпуска — изменена', () => {
    expect(changedSinceIssue({ name: 'Зимина Ольга' }, { name: 'Зимина Ольга В.' })).toBe(true);
  });

  it('пробелы по краям правкой не считаются', () => {
    expect(changedSinceIssue({ name: ' Зимина ' }, { name: 'Зимина' })).toBe(false);
  });

  it('новая или переименованная колонка не делает документ устаревшим', () => {
    expect(changedSinceIssue({ fio: 'Зимина', team: 'А' }, { name: 'Зимина' })).toBe(false);
  });

  it('без снимка выпуска сравнивать не с чем', () => {
    expect(changedSinceIssue({ name: 'Зимина' }, null)).toBe(false);
  });
});
