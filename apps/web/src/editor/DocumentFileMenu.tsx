import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  FilePlus2,
  FolderOpen,
  FolderInput,
  LayoutTemplate,
  PencilLine,
  Trash2,
} from 'lucide-react';
import { TRASH_DAYS } from '@gramota/shared';
import { api } from '../api/client';
import { useFolders } from '../api/folders';
import type { DocumentDetail } from '../api/types';
import { Button } from '../ui/Button';
import { Label } from '../ui/Field';
import { Select } from '../ui/Select';
import { Dialog } from '../ui/Dialog';
import type { MenuEntry } from './DocumentChrome';
import { DOCUMENT_TITLE_ID } from './DocumentTitle';

/**
 * Меню «Файл» — действия над материалом целиком.
 *
 * Живёт отдельно от страниц, потому что нужно обеим: и листу, и таблице.
 * Пока эти действия были только в библиотеке, переименовать открытый материал
 * было нельзя — приходилось уходить со страницы, искать его в списке и потом
 * возвращаться, теряя место на листе.
 *
 * Возвращает и пункты меню, и окна к ним: окно переноса без пункта
 * бессмысленно, а пункт без окна ничего не делает, поэтому они и заводятся
 * одним вызовом.
 *
 * Своего окна у переименования нет: название правится на месте в шапке,
 * и пункт меню просто ставит туда курсор — как «Файл → Переименовать»
 * в Google Docs. Два разных способа одного действия на одном экране
 * заставляли бы гадать, чем они отличаются.
 */
export function useDocumentFileMenu(doc: DocumentDetail | undefined): {
  entries: MenuEntry[];
  dialogs: ReactNode;
} {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [folderId, setFolderId] = useState<string | ''>('');

  const folders = useFolders();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['document', doc?.id] });
    void qc.invalidateQueries({ queryKey: ['documents'] });
  };

  const move = useMutation({
    mutationFn: (value: string | null) =>
      api.patch<DocumentDetail>(`/documents/${doc!.id}`, { folderId: value }),
    onSuccess: () => {
      setMoving(false);
      refresh();
    },
  });

  /* Копия открывается сразу: её и снимают, чтобы тут же править под новое
     мероприятие, а не чтобы полюбоваться ею в списке. */
  const duplicate = useMutation({
    mutationFn: () => api.post<DocumentDetail>(`/documents/${doc!.id}/duplicate`, {}),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      navigate(`/documents/${created.id}`);
    },
  });

  /* Шаблон — копия, и открываем именно её: иначе правки, которые человек
     начнёт тут же вносить «в шаблон», уйдут в сам документ. */
  const saveAsTemplate = useMutation({
    mutationFn: () => api.post<DocumentDetail>(`/documents/${doc!.id}/template`, {}),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      navigate(`/documents/${created.id}`);
    },
  });

  const isTemplate = Boolean(doc?.isTemplate);

  const remove = useMutation({
    mutationFn: () => api.delete<{ ok: true }>(`/documents/${doc!.id}`),
    onSuccess: () => {
      setDeleting(false);
      void qc.invalidateQueries({ queryKey: ['documents'] });
      navigate(isTemplate ? '/documents/templates' : '/documents');
    },
  });

  const entries: MenuEntry[] = [
    {
      icon: <FilePlus2 size={16} />,
      label: 'Создать документ',
      onSelect: () => navigate('/documents?new=1'),
    },
    {
      icon: <FolderOpen size={16} />,
      label: 'Открыть',
      onSelect: () => navigate('/documents'),
    },
    { separator: true },
    {
      icon: <Copy size={16} />,
      label: isTemplate ? 'Создать копию шаблона' : 'Создать копию документа',
      disabled: !doc || duplicate.isPending,
      onSelect: () => duplicate.mutate(),
    },
    // У шаблона «Документ по шаблону» — главная кнопка в шапке, не пункт меню.
    ...(isTemplate
      ? []
      : [
          {
            icon: <LayoutTemplate size={16} />,
            label: 'Сохранить как шаблон',
            disabled: !doc || saveAsTemplate.isPending,
            onSelect: () => saveAsTemplate.mutate(),
          },
        ]),
    {
      icon: <PencilLine size={16} />,
      label: 'Переименовать',
      disabled: !doc,
      // После кадра: пункт меню ещё держит фокус от нажатия.
      onSelect: () =>
        requestAnimationFrame(() => document.getElementById(DOCUMENT_TITLE_ID)?.focus()),
    },
    {
      icon: <FolderInput size={16} />,
      label: 'Переместить',
      // Шаблоны общие на организацию и по папкам не раскладываются.
      disabled: !doc || isTemplate,
      onSelect: () => {
        setFolderId(doc?.folderId ?? '');
        setMoving(true);
      },
    },
    { separator: true },
    {
      icon: <Trash2 size={16} />,
      label: 'Удалить',
      danger: true,
      disabled: !doc,
      onSelect: () => setDeleting(true),
    },
  ];

  const dialogs = (
    <>
      {moving && (
        <Dialog
          title="Переместить материал"
          onClose={() => setMoving(false)}
          footer={
            <>
              <Button
                variant="primary"
                disabled={move.isPending}
                onClick={() => move.mutate(folderId === '' ? null : folderId)}
              >
                {move.isPending ? 'Переносим…' : 'Переместить'}
              </Button>
              <Button variant="ghost" onClick={() => setMoving(false)}>
                Отмена
              </Button>
            </>
          }
        >
          <Label>Папка</Label>
          <Select
            value={folderId}
            onChange={setFolderId}
            options={[
              { value: '', label: 'Вне папок' },
              ...(folders.data ?? []).map((f) => ({ value: f.id, label: f.name })),
            ]}
          />
          {move.isError && (
            <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
              {(move.error as Error).message}
            </p>
          )}
        </Dialog>
      )}

      {deleting && (
        <Dialog
          title="Удалить материал"
          onClose={() => setDeleting(false)}
          footer={
            <>
              <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
                {remove.isPending ? 'Удаляем…' : 'Удалить'}
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(false)}>
                Отмена
              </Button>
            </>
          }
        >
          {/* Про архив говорим прямо: без этой строчки удаление читается
              как безвозвратное, и его боятся нажимать даже там, где надо. */}
          <p className="text-sm">
            «{doc?.title}» уедет в архив. Оттуда его можно вернуть в течение {TRASH_DAYS} дней,
            потом он исчезнет насовсем.
          </p>
          {remove.isError && (
            <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
              {(remove.error as Error).message}
            </p>
          )}
        </Dialog>
      )}
    </>
  );

  return { entries, dialogs };
}
