import { describe, expect, it } from 'vitest';
import { documentOptions } from './RegistryFilters';
import type { RegistryFacets } from '../api/registry';

const ID = '8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a';

const facets: RegistryFacets = {
  documents: [
    { id: ID, title: 'Грамота за первенство', eventName: '', eventDate: '', deletedAt: null },
    { id: 'иной', title: 'Сертификат', eventName: '', eventDate: '', deletedAt: '2026-08-01' },
  ],
  events: [],
  trashDays: 7,
};

/*
 * Отбор, который стоит, обязан быть виден. Иначе «ничего не найдено»
 * при поле «Любой» читается как «у меня вообще ничего не выдано».
 */
describe('материалы в отборе реестра', () => {
  it('называет то, что прислал сервер, и помечает корзину', () => {
    expect(documentOptions(facets, '')).toEqual([
      { id: ID, label: 'Грамота за первенство' },
      { id: 'иной', label: 'Сертификат (в корзине)' },
    ]);
  });

  it('не задваивает материал, который сервер и так назвал', () => {
    expect(documentOptions(facets, ID)).toHaveLength(2);
  });

  it('показывает материал из адреса, по которому ещё ничего не выдано', () => {
    // Ровно случай ссылки «выданное» из рабочего места нового материала.
    const empty: RegistryFacets = { documents: [], events: [], trashDays: 7 };
    expect(documentOptions(empty, ID)).toEqual([{ id: ID, label: 'Выбранный материал' }]);
  });

  it('без отбора по материалу ничего не выдумывает', () => {
    expect(documentOptions(undefined, '')).toEqual([]);
  });
});
