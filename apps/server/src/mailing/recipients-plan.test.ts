import { describe, expect, it } from 'vitest';
import { parseEmailList, planLetters, type PlanInput, type PlanRow } from './recipients-plan';

const rows: PlanRow[] = [
  { id: 'r1', data: { name: 'Иванов Иван', email: 'ivanov@example.ru' }, lastFileId: 'f1' },
  { id: 'r2', data: { name: 'Петров Пётр', email: 'petrov@example.ru' }, lastFileId: 'f2' },
];

function plan(overrides: Partial<PlanInput> = {}) {
  return planLetters({
    source: 'table',
    rows,
    manualEmails: [],
    requireFile: true,
    alreadySent: new Set(),
    consented: null,
    ...overrides,
  });
}

describe('получатели из таблицы', () => {
  it('письма уходят всем, у кого есть адрес и готовый документ', () => {
    const { letters, skipped } = plan();
    expect(letters.map((l) => l.email)).toEqual(['ivanov@example.ru', 'petrov@example.ru']);
    expect(skipped).toEqual([]);
  });

  it('строка без адреса пропускается с объяснением, а не молча', () => {
    const { letters, skipped } = plan({
      rows: [{ id: 'r1', data: { name: 'Иванов Иван' }, lastFileId: 'f1' }],
    });
    expect(letters).toHaveLength(0);
    expect(skipped).toEqual([{ name: 'Иванов Иван', email: '', reason: 'нет адреса' }]);
  });

  it('испорченный адрес показывается человеку целиком — его же и исправлять', () => {
    const { skipped } = plan({
      rows: [{ id: 'r1', data: { name: 'Иванов', email: 'ivanov@' }, lastFileId: 'f1' }],
    });
    expect(skipped[0].reason).toContain('ivanov@');
  });

  it('без выпущенного документа письмо не уходит, когда обещано вложение', () => {
    const { letters, skipped } = plan({
      rows: [{ id: 'r1', data: { name: 'Иванов', email: 'ivanov@example.ru' }, lastFileId: null }],
    });
    expect(letters).toHaveLength(0);
    expect(skipped[0].reason).toBe('документ ещё не создан');
  });

  it('без вложения письмо уходит и тем, у кого документа нет', () => {
    const { letters } = plan({
      requireFile: false,
      rows: [{ id: 'r1', data: { name: 'Иванов', email: 'ivanov@example.ru' }, lastFileId: null }],
    });
    expect(letters).toHaveLength(1);
    expect(letters[0].fileId).toBeNull();
  });

  it('адрес, встретившийся в таблице дважды, получает одно письмо', () => {
    const { letters, skipped } = plan({
      rows: [
        { id: 'r1', data: { name: 'Иванов', email: 'ivanov@example.ru' }, lastFileId: 'f1' },
        { id: 'r2', data: { name: 'Иванов И.', email: 'IVANOV@example.ru' }, lastFileId: 'f2' },
      ],
    });
    expect(letters).toHaveLength(1);
    expect(skipped[0].reason).toBe('адрес уже есть в этой рассылке');
  });
});

describe('защита от повторной отправки', () => {
  it('адрес, которому по этому материалу уже писали, пропускается', () => {
    const { letters, skipped } = plan({ alreadySent: new Set(['ivanov@example.ru']) });
    expect(letters.map((l) => l.email)).toEqual(['petrov@example.ru']);
    expect(skipped[0].reason).toContain('уже уходило');
  });

  it('сравнение адресов не зависит от регистра', () => {
    const { letters } = plan({
      alreadySent: new Set(['ivanov@example.ru']),
      rows: [{ id: 'r1', data: { name: 'Иванов', email: 'Ivanov@Example.RU' }, lastFileId: 'f1' }],
    });
    expect(letters).toHaveLength(0);
  });
});

describe('согласие на рекламу', () => {
  it('без согласия рекламное письмо не уходит', () => {
    const { letters, skipped } = plan({ consented: new Set(['petrov@example.ru']) });
    expect(letters.map((l) => l.email)).toEqual(['petrov@example.ru']);
    expect(skipped[0].reason).toBe('нет согласия на рекламную рассылку');
  });

  it('для транзакционной отправки согласие не спрашивается', () => {
    const { letters } = plan({ consented: null });
    expect(letters).toHaveLength(2);
  });

  it('пустой список согласий — это «слать некому», а не «слать всем»', () => {
    const { letters } = plan({ consented: new Set() });
    expect(letters).toHaveLength(0);
  });
});

describe('список адресов, набранный руками', () => {
  const manual = (emails: string[], overrides: Partial<PlanInput> = {}) =>
    planLetters({
      source: 'manual',
      rows,
      manualEmails: emails,
      requireFile: true,
      alreadySent: new Set(),
      consented: null,
      ...overrides,
    });

  it('адрес из таблицы получает её данные и выпущенный документ', () => {
    const { letters } = manual(['ivanov@example.ru']);
    expect(letters).toEqual([
      {
        rowId: 'r1',
        email: 'ivanov@example.ru',
        data: { name: 'Иванов Иван', email: 'ivanov@example.ru' },
        fileId: 'f1',
      },
    ]);
  });

  it('посторонний адрес без вложения получает письмо, а с вложением — нет', () => {
    const withoutFile = manual(['guest@example.ru'], { requireFile: false });
    expect(withoutFile.letters).toHaveLength(1);

    const withFile = manual(['guest@example.ru']);
    expect(withFile.letters).toHaveLength(0);
    expect(withFile.skipped[0].reason).toBe('документ ещё не создан');
  });

  it('отмеченность строк для списка адресов роли не играет', () => {
    const { letters } = manual(['petrov@example.ru'], {
      rows: [{ id: 'r2', data: { name: 'Петров', email: 'petrov@example.ru' }, lastFileId: 'f2' }],
    });
    expect(letters[0].rowId).toBe('r2');
  });
});

describe('разбор вставленного списка адресов', () => {
  it('понимает переводы строк, запятые, точки с запятой и пробелы', () => {
    expect(parseEmailList('a@x.ru\nb@x.ru, c@x.ru; d@x.ru e@x.ru')).toEqual([
      'a@x.ru',
      'b@x.ru',
      'c@x.ru',
      'd@x.ru',
      'e@x.ru',
    ]);
  });

  it('повторы схлопывает и приводит к нижнему регистру', () => {
    expect(parseEmailList('A@X.ru\na@x.ru')).toEqual(['a@x.ru']);
  });

  it('пустая строка даёт пустой список, а не список из пустоты', () => {
    expect(parseEmailList('  \n , ; ')).toEqual([]);
  });
});
