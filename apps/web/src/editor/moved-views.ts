import { materialPath } from '../documents/material-steps';

/**
 * Куда уехали прежние вкладки редактора.
 *
 * Адреса вида `/documents/:id?view=table` разошлись по закладкам,
 * письмам и истории браузера: человек нажимал на такую ссылку, чтобы
 * попасть к списку, и молча показать ему макет — значит потерять его
 * на ровном месте. Поэтому старый адрес не игнорируется, а переводится
 * в шаг документа.
 */
export function movedViewTarget(view: string | null, documentId: string): string | null {
  if (!view || view === 'editor') return null;

  // Выданное по документу теперь ищется в общем реестре — отбором
  // по документу, а не отдельной таблицей внутри него.
  if (view === 'registry') return `/registry?documentId=${encodeURIComponent(documentId)}`;

  switch (view) {
    case 'table':
      return materialPath(documentId, 'recipients');
    case 'rules':
      return materialPath(documentId, 'rules');
    case 'check':
      return materialPath(documentId, 'check');
    case 'mail':
      return materialPath(documentId, 'letter');
    default:
      return null;
  }
}
