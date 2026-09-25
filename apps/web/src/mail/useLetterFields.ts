import { useMemo } from 'react';
import { KNOWN_COLUMN_TITLES } from '../editor/fields';
import { useDocumentFields } from '../editor/useDocumentFields';

/**
 * Поля, которые можно подставить в письмо, и подписи их фишек.
 *
 * Только колонки таблицы: письмо получает данные строки, а «Дату выпуска»
 * и номер знает лист, — предлагать их здесь значит обещать подстановку,
 * которой не будет.
 */
export function useLetterFields(documentId: string) {
  const { fields: all } = useDocumentFields(documentId);
  const fields = useMemo(() => all.filter((f) => f.kind === 'column'), [all]);
  const hasTable = fields.length > 0;

  const labels = useMemo<Record<string, string>>(
    // Пока таблицы нет, сравнивать не с чем: называем по-человечески хотя бы
    // привычные ключи вроде «name» из письма по умолчанию.
    () => (hasTable ? Object.fromEntries(fields.map((f) => [f.source, f.title])) : { ...KNOWN_COLUMN_TITLES }),
    [fields, hasTable],
  );
  const known = useMemo(() => (hasTable ? new Set(fields.map((f) => f.source)) : null), [fields, hasTable]);

  return { fields, labels, known };
}
