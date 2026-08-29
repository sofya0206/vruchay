import { describe, expect, it } from 'vitest';
import { emptyFilters, filtersFromQuery, filtersToQuery } from './registry';

/*
 * Отбор из адреса — то, чем ссылка «выданное по этому материалу» держится.
 * Без него реестр открывался бы весь целиком, и переезд вкладки «Реестр»
 * из редактора превратился бы из переноса в потерю.
 */
describe('отбор из адреса', () => {
  it('сужает реестр по материалу', () => {
    const id = '8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a';
    expect(filtersFromQuery(`documentId=${id}`).documentId).toBe(id);
  });

  it('пустой адрес значит «всё подряд»', () => {
    expect(filtersFromQuery('')).toEqual(emptyFilters);
  });

  it('не берёт из адреса ничего, кроме известных полей', () => {
    // Чужая ссылка не должна класть в отбор своё поле: оно уедет
    // на сервер строкой запроса.
    const filters = filtersFromQuery('search=Иванова&limit=100000&orgId=чужая');
    expect(filters.search).toBe('Иванова');
    expect(Object.keys(filters).sort()).toEqual(Object.keys(emptyFilters).sort());
  });

  it('не принимает выдуманное состояние документа', () => {
    expect(filtersFromQuery('state=revoked').state).toBe('revoked');
    expect(filtersFromQuery('state=; drop').state).toBe('');
  });

  it('переживает дорогу туда и обратно', () => {
    const id = '8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a';
    const filters = { ...emptyFilters, documentId: id, state: 'valid' as const };
    expect(filtersFromQuery(filtersToQuery(filters))).toEqual(filters);
  });
});
