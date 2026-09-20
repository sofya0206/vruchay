import { legacyWorkspaceTab, materialPath, type MaterialView } from '../documents/material-steps';

/**
 * Прежние имена рабочего места материала.
 *
 * Шаги документа живут в documents/material-steps.ts; этот файл — тонкая
 * прослойка для кода, который ещё зовёт вкладки старыми именами. Уйдёт,
 * когда последний вызов переедет.
 */
export type WorkspaceTab = 'table' | 'rules' | 'check' | 'mail' | 'verify';

const VIEW_OF: Record<WorkspaceTab, MaterialView> = {
  table: 'recipients',
  rules: 'rules',
  check: 'check',
  mail: 'letter',
  verify: 'issue',
};

/** Адрес прежней вкладки — теперь это шаг документа. */
export function workspacePath(documentId: string, tab: WorkspaceTab = 'table'): string {
  return materialPath(documentId, VIEW_OF[tab]);
}

export { legacyWorkspaceTab };
