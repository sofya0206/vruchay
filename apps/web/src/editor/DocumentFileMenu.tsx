import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  FilePlus2,
  FolderOpen,
  FolderInput,
  PencilLine,
  Trash2,
} from 'lucide-react';
import { TRASH_DAYS } from '@gramota/shared';
import { api } from '../api/client';
import { useFolders } from '../api/folders';
import type { DocumentDetail } from '../api/types';
import { Button } from '../ui/Button';
import { Input, Label, Select } from '../ui/Field';
import { Dialog } from '../mailing/Dialog';
import type { MenuEntry } from './MenuBar';

/**
 * Меню «Файл» — действия над материалом целиком.
 *
 * Живёт отдельно от страниц, потому что нужно обеим: и листу, и таблице.
 * Пока эти действия были только в библиотеке, переименовать открытый материал
 * было нельзя — приходилось уходить со страницы, искать его в списке и потом
 * возвращаться, теряя место на листе.
 *
 * Возвращает и пункты меню, и окна к ним: окно переименования без пункта
 * бессмысленно, а пункт без окна ничего не делает, поэтому они и заводятся
 * одним вызовом.
 */
export function useDocumentFileMenu(doc: DocumentDetail | undefined): {
  entries: MenuEntry[];
  dialogs: ReactNode;
} {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState<string | ''>('');

  const folders = useFolders();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['document', doc?.id] });
    void qc.invalidateQueries({ queryKey: ['documents'] });
  };

  const rename = useMutation({
    mutationFn: (value: string) =>
      api.patch<DocumentDetail>(`/documents/${doc!.id}`, { title: value }),
    onSuccess: () => {
      setRenaming(false);
      refresh();
    },
  });

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

  const remove = useMutation({
    mutationFn: () => api.delete<{ ok: true }>(`/documents/${doc!.id}`),
    onSuccess: () => {
      setDeleting(false);
      void qc.invalidateQueries({ queryKey: ['documents'] });
      navigate('/documents');
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
      label: 'Создать копию документа',
      disabled: !doc || duplicate.isPending,
      onSelect: () => duplicate.mutate(),
    },
    {
      icon: <PencilLine size={16} />,
      label: 'Переименовать',
      disabled: !doc,
      onSelect: () => {
        setTitle(doc?.title ?? '');
        setRenaming(true);
      },
    },
    {
      icon: <FolderInput size={16} />,
      label: 'Переместить',
      disabled: !doc,
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
      {renaming && (
        <Dialog
          title="Переименовать материал"
          onClose={() => setRenaming(false)}
          footer={
            <>
              <Button
                variant="primary"
                disabled={!title.trim() || rename.isPending}
                onClick={() => rename.mutate(title.trim())}
              >
                {rename.isPending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
              <Button variant="ghost" onClick={() => setRenaming(false)}>
                Отмена
              </Button>
            </>
          }
        >
          <Label>Название</Label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && title.trim()) rename.mutate(title.trim());
            }}
          />
          {rename.isError && (
            <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
              {(rename.error as Error).message}
            </p>
          )}
        </Dialog>
      )}

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
          <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Вне папок</option>
            {(folders.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
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
