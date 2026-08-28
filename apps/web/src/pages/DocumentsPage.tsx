import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Search, Trash2 } from 'lucide-react';
import { UsageBar } from '../documents/UsageBar';
import { TRASH_DAYS } from '@gramota/shared';
import { api } from '../api/client';
import type { DocumentDetail, DocumentList, DocumentSummary } from '../api/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { DocumentCard } from '../documents/DocumentCard';
import { PageSizePicker, type PageSizeValue } from '../documents/PageSizePicker';

export function DocumentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  // A4 альбомная — то, на чём печатают грамоты чаще всего.
  const [size, setSize] = useState<PageSizeValue>({ widthMm: 297, heightMm: 210 });

  const [trash, setTrash] = useState(false);

  const documents = useQuery({
    queryKey: ['documents', search, trash],
    queryFn: () =>
      api.get<DocumentList>(
        `/documents?limit=50&trashed=${trash}` +
          (search ? `&search=${encodeURIComponent(search)}` : ''),
      ),
  });

  // Счётчик корзины нужен и когда мы её не смотрим: иначе про удалённое
  // просто забывают, а оно через неделю исчезает насовсем.
  const trashCount = useQuery({
    queryKey: ['documents-trash-count'],
    queryFn: () => api.get<DocumentList>('/documents?limit=1&trashed=true'),
    select: (d) => d.total,
  });

  const create = useMutation({
    mutationFn: (t: string) =>
      api.post<DocumentDetail>('/documents', {
        title: t,
        pageWidthMm: size.widthMm,
        pageHeightMm: size.heightMm,
      }),
    onSuccess: () => {
      setTitle('');
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  /** После любого действия обновляем и список, и счётчик корзины. */
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['documents'] });
    void qc.invalidateQueries({ queryKey: ['documents-trash-count'] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/documents/${id}`),
    onSuccess: refresh,
  });

  const restore = useMutation({
    mutationFn: (id: string) => api.post<{ ok: true }>(`/documents/${id}/restore`, {}),
    onSuccess: refresh,
  });

  const purge = useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/documents/${id}/purge`),
    onSuccess: refresh,
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => api.post<DocumentDetail>(`/documents/${id}/duplicate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });

  const rename = useMutation({
    mutationFn: (v: { id: string; title: string }) =>
      api.patch<DocumentDetail>(`/documents/${v.id}`, { title: v.title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });

  function onRename(doc: DocumentSummary) {
    const title = window.prompt('Новое название документа', doc.title)?.trim();
    if (title && title !== doc.title) rename.mutate({ id: doc.id, title });
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (title.trim()) create.mutate(title.trim());
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {/* Остаток пробы — до всего остального: человек должен знать,
            сколько у него есть, ещё до того как начнёт награждение,
            а не упереться в предел на сорок седьмом документе. */}
      {!trash && <UsageBar />}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{trash ? 'Корзина' : 'Материалы'}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {trash ? (
              <>Удалённое хранится {TRASH_DAYS} дней, потом стирается насовсем</>
            ) : (
              <>Грамоты, дипломы, сертификаты, благодарности — что угодно на бланке</>
            )}
            {documents.data ? ` · ${documents.data.total}` : ''}
          </p>
        </div>
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию"
            className="w-56 pl-9"
          />
        </div>
      </div>

      {/* Переключатель, а не отдельная страница: корзина — тот же список,
            и человеку не надо гадать, где искать выброшенное. Показываем
            только когда в ней что-то есть, чтобы не занимать место зря. */}
      {(trash || (trashCount.data ?? 0) > 0) && (
        <div className="mb-4 flex gap-1 rounded-lg bg-[var(--surface-sunken)] p-0.5">
          <ListTab active={!trash} onClick={() => setTrash(false)}>
            Материалы
          </ListTab>
          <ListTab active={trash} onClick={() => setTrash(true)}>
            <Trash2 size={14} /> Корзина
            {(trashCount.data ?? 0) > 0 && (
              <span className="tabular text-[var(--text-muted)]">{trashCount.data}</span>
            )}
          </ListTab>
        </div>
      )}

      {/* Размер выбирается до создания, а не после: поменять его у документа,
            на котором уже расставлен текст, значит сдвинуть весь макет. */}
      <form
        onSubmit={onCreate}
        hidden={trash}
        className="mb-6 space-y-3 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
      >
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название нового документа, например «Сертификат участника семинара»"
          />
          <Button
            type="submit"
            variant="primary"
            icon={<Plus size={16} />}
            disabled={create.isPending || !title.trim()}
          >
            Создать
          </Button>
        </div>
        <PageSizePicker value={size} onChange={setSize} />
      </form>

      {documents.isPending && <p className="text-[var(--text-muted)]">Загрузка…</p>}

      {documents.data?.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-16 text-center">
          {trash ? (
            <>
              <Trash2
                size={28}
                className="mx-auto mb-3 text-[var(--text-muted)]"
                strokeWidth={1.5}
              />
              <p className="font-medium">Корзина пуста</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Удалённые материалы лежат здесь {TRASH_DAYS} дней — успеете передумать
              </p>
            </>
          ) : (
            <>
              <FileText
                size={28}
                className="mx-auto mb-3 text-[var(--text-muted)]"
                strokeWidth={1.5}
              />
              <p className="font-medium">{search ? 'Ничего не нашлось' : 'Здесь пока пусто'}</p>
              {search ? (
                <p className="mt-1 text-sm text-[var(--text-muted)]">Попробуйте изменить запрос</p>
              ) : (
                /* Не повторяем инструкцию, а показываем на поле, которое
                     стоит прямо над этой рамкой: новичок на пустом экране
                     ищет, куда нажать, а не что почитать. */
                <div className="mt-1 text-sm text-[var(--text-muted)]">
                  <p>
                    Начните сверху: впишите название — например «Грамота за первое место» — и
                    нажмите «Создать».
                  </p>
                  <p className="mt-2">
                    Дальше загрузите свой бланк и расставьте по нему поля: фамилию, место, дату.
                    Ничего страшного не произойдёт — пока вы не создали файлы, ничего не
                    расходуется.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {documents.data?.items.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            onRename={onRename}
            onDuplicate={(d) => duplicate.mutate(d.id)}
            onDelete={(d) => remove.mutate(d.id)}
            onRestore={(d) => restore.mutate(d.id)}
            onPurge={(d) => purge.mutate(d.id)}
          />
        ))}
      </ul>
    </main>
  );
}

/** Переключатель «Материалы / Корзина». */
function ListTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-[var(--surface)] font-medium shadow-sm'
          : 'text-[var(--text-muted)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  );
}
