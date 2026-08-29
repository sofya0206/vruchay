import { workspacePath, type WorkspaceTab } from '../mailing/workspace-tabs';

/**
 * Куда уехали прежние вкладки редактора.
 *
 * Редактор больше не занимается ни списками, ни письмами, ни выданным:
 * получатели, правила, проверка и письмо живут на «Рассылке», выданное —
 * в «Реестре». Но адреса вида `/documents/:id?view=table` разошлись
 * по закладкам, письмам и истории браузера: человек нажимал на такую
 * ссылку, чтобы попасть к списку, и молча показать ему макет — значит
 * потерять его на ровном месте.
 *
 * Поэтому старый адрес не игнорируется, а переводится в новый.
 */
const MOVED: Record<string, WorkspaceTab> = {
  table: 'table',
  rules: 'rules',
  check: 'check',
  mail: 'mail',
};

export function movedViewTarget(view: string | null, documentId: string): string | null {
  if (!view || view === 'editor') return null;

  // Выданное по материалу теперь ищется в общем реестре — отбором
  // по материалу, а не отдельной таблицей внутри материала.
  if (view === 'registry') return `/registry?documentId=${encodeURIComponent(documentId)}`;

  const tab = MOVED[view];
  return tab ? workspacePath(documentId, tab) : null;
}
