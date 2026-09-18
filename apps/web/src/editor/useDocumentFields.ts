import { useMemo } from 'react';
import { useRecipients } from '../api/recipients';
import { fieldRegistry, type FieldInfo } from './fields';

/**
 * Поля документа — одним списком для листа, письма и панели полей.
 *
 * Раньше список собирал только редактор листа, и на остальных вкладках
 * материала посмотреть, какие поля есть, было негде.
 */
export function useDocumentFields(documentId: string) {
  const recipients = useRecipients(documentId);

  const columns = useMemo(
    () => (recipients.data?.columns ?? []).map((c) => ({ id: c.id, name: c.name })),
    [recipients.data],
  );
  const fields = useMemo<FieldInfo[]>(() => {
    // Заголовки из загруженного файла — как назвал колонки сам человек.
    const titles = new Map((recipients.data?.columns ?? []).map((c) => [c.name, c.title]));
    return fieldRegistry(columns).map((f) =>
      f.kind === 'column' && titles.get(f.source) ? { ...f, title: titles.get(f.source)! } : f,
    );
  }, [columns, recipients.data]);

  return { recipients, columns, fields };
}
