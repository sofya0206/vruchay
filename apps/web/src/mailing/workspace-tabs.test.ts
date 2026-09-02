import { describe, expect, it } from 'vitest';
import { WORKSPACE_TABS, workspacePath, workspaceTab } from './workspace-tabs';

/*
 * Состав вкладок — не оформление: по нему видно, что работа со списком
 * и письмом переехала из редактора целиком, а не наполовину.
 */
describe('вкладки рабочего места материала', () => {
  it('держит всё, что уехало из редактора, и ничего про макет', () => {
    expect(WORKSPACE_TABS.map((t) => t.label)).toEqual([
      'Получатели',
      'Правила',
      'Проверка',
      'Письмо',
      'Подлинность',
    ]);
  });

  it('открывается на получателях: ради них сюда и приходят', () => {
    expect(workspaceTab(null)).toBe('table');
    expect(workspaceTab('table')).toBe('table');
  });

  it('устаревшую вкладку в адресе не считает ошибкой', () => {
    // Ссылка из письма полугодовой давности не должна кончаться пустотой.
    expect(workspaceTab('registry')).toBe('table');
    expect(workspaceTab('чтотоещё')).toBe('table');
  });

  it('называет вкладку в адресе, кроме первой', () => {
    const id = '8f0e6a0e-0f5b-4a1a-9c3a-2f2b1d4e5c6a';
    expect(workspacePath(id)).toBe(`/mailing/${id}`);
    expect(workspacePath(id, 'mail')).toBe(`/mailing/${id}?tab=mail`);
  });
});
