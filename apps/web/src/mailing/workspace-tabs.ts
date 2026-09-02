/**
 * Вкладки рабочего места материала на «Рассылке».
 *
 * Всё, что относится к списку и к письму, живёт здесь, а не в редакторе
 * макета: файлы почти всегда делают заранее, а рассылают в день
 * награждения, и человеку, пришедшему разослать, незачем идти через лист.
 *
 * Список отдельным модулем, а не разметкой внутри страницы: по нему
 * же разбирается адрес, и вкладка, которую можно назвать в ссылке,
 * не может разойтись с вкладкой, которая нарисована.
 */
export type WorkspaceTab = 'table' | 'rules' | 'check' | 'mail' | 'verify';

export interface WorkspaceTabInfo {
  id: WorkspaceTab;
  label: string;
}

export const WORKSPACE_TABS: WorkspaceTabInfo[] = [
  { id: 'table', label: 'Получатели' },
  { id: 'rules', label: 'Правила' },
  // Между получателями и письмом: проверка идёт после того, как список
  // собран, и до того, как из него что-то выпустят.
  { id: 'check', label: 'Проверка' },
  { id: 'mail', label: 'Письмо' },
  // Подлинность — про уже выданное: срок действия, страница проверки.
  // Живёт здесь, а не в редакторе макета, по той же причине, что и
  // остальные вкладки: это настройки выпуска, а не рисунка на листе.
  { id: 'verify', label: 'Подлинность' },
];

/**
 * Какую вкладку открыть по адресу `?tab=`.
 *
 * Незнакомое значение не ошибка, а устаревшая ссылка: показываем список
 * получателей — то, ради чего сюда приходят чаще всего.
 */
export function workspaceTab(param: string | null): WorkspaceTab {
  const known = WORKSPACE_TABS.find((tab) => tab.id === param);
  return known?.id ?? 'table';
}

/** Адрес рабочего места материала — одно место, где он собирается. */
export function workspacePath(documentId: string, tab: WorkspaceTab = 'table'): string {
  const base = `/mailing/${encodeURIComponent(documentId)}`;
  return tab === 'table' ? base : `${base}?tab=${tab}`;
}
