import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { issuedAtOf, SYSTEM_VARIABLE_NAMES } from '@gramota/shared';
import { api } from '../api/client';
import { useOrgProfile } from '../api/org';
import { useRecipients } from '../api/recipients';
import type { DocumentDetail } from '../api/types';
import { fieldRegistry, type FieldInfo } from './fields';
import { canvasPreviewData } from './preview-data';

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

/**
 * Образцы значений для панели полей: что встанет на место поля.
 *
 * Название «Место» ничего не говорит, пока рядом не написано «1».
 * Берём первую строку списка и настоящие сведения о мероприятии —
 * те же, что лист показывает на холсте, — а не выдуманные примеры.
 */
export function useFieldSamples(documentId: string): Record<string, string> {
  const recipients = useRecipients(documentId);
  const org = useOrgProfile();
  const doc = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => api.get<DocumentDetail>(`/documents/${documentId}`),
  });

  return useMemo(() => {
    const rows = recipients.data?.rows ?? [];
    const first = rows[0]?.data ?? {};
    const all = canvasPreviewData({
      row: first,
      orgName: org.data?.orgName,
      event: {
        name: doc.data?.eventName,
        date: doc.data?.eventDate,
        place: doc.data?.eventPlace,
        hours: doc.data?.eventHours,
      },
      issuedAt: issuedAtOf(doc.data?.issueDate),
      number: 1,
      total: rows.length,
    });
    // Служебные — из подстановки; колонки — только из настоящей строки:
    // при пустой таблице образец подставил бы выдуманную фамилию.
    const samples: Record<string, string> = {};
    for (const name of SYSTEM_VARIABLE_NAMES) if (all[name]) samples[name] = all[name];
    for (const [key, value] of Object.entries(first)) if (value.trim()) samples[key] = value;
    return samples;
  }, [recipients.data, org.data, doc.data]);
}
