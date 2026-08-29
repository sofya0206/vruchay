import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Search, Trash2 } from 'lucide-react';
import { UsageBar } from '../documents/UsageBar';
import {
  DOCUMENT_CATEGORIES,
  TRASH_DAYS,
  type DocumentCategory,
  type StarterPreset,
} from '@gramota/shared';
import { api } from '../api/client';
import type { DocumentDetail, DocumentList, DocumentSummary } from '../api/types';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Field';
import { DocumentCard } from '../documents/DocumentCard';
import { PageSizePicker, type PageSizeValue } from '../documents/PageSizePicker';
import { PresetGallery } from '../documents/PresetGallery';
import { LibraryFilters, type LibrarySort } from '../documents/LibraryFilters';

/**
 * Библиотека материалов.
 *
 * До неё здесь был плоский список: человек входил в сервис, видел пустоту
 * и не знал, с чего начать. Теперь первое, что он видит, — готовые заготовки,
 * из которых материал делается в одно нажатие, а свои материалы разложены
 * по разделам и ищутся поиском.
 */
export function DocumentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DocumentCategory | null>(null);
  const [sort, setSort] = useState<LibrarySort>('updated');
  const [title, setTitle] = useState('');
  const [newCategory, setNewCategory] = useState<DocumentCategory | ''>('');
  // A4 альбомная — то, на чём печатают грамоты чаще всего.
  const [size, setSize] = useState<PageSizeValue>({ widthMm: 297, heightMm: 210 });
  const [scratch, setScratch] = useState(false);

  const [trash, setTrash] = useState(false);

  const documents = useQuery({
    queryKey: ['documents', search, trash, category, sort],
    queryFn: () =>
      api.get<DocumentList>(
        `/documents?limit=50&trashed=${trash}&sort=${sort}` +
          (search ? `&search=${encodeURIComponent(search)}` : '') +
          (category ? `&category=${category}` : ''),
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
    mutationFn: (v: { title: string; category?: DocumentCategory; presetId?: string }) =>
      api.post<DocumentDetail>('/documents', {
        title: v.title,
        pageWidthMm: size.widthMm,
        pageHeightMm: size.heightMm,
        ...(v.category ? { category: v.category } : {}),
        ...(v.presetId ? { presetId: v.presetId } : {}),
      }),
    onSuccess: (doc, variables) => {
      setTitle('');
      setScratch(false);
      void qc.invalidateQueries({ queryKey: ['documents'] });
      // Из заготовки — сразу в редактор: иначе клик по заготовке выглядит
      // так, будто ничего не произошло, и человек кликает ещё раз.
      if (variables.presetId) {
        navigate(`/documents/${doc.id}`);
      }
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
    if (title.trim()) {
      create.mutate({ title: title.trim(), category: newCategory || undefined });
    }
  }

  function onPickPreset(preset: StarterPreset) {
    create.mutate({ title: preset.documentTitle, presetId: preset.id });
  }

  const items = documents.data?.items ?? [];
  const nothingFound = documents.data?.items.length === 0;
  // Заготовки — вход по умолчанию. Форма с пустым названием открывается
  // только по явной просьбе: в ней нечего показать, кроме поля ввода.
  const showGallery = !trash && !scratch;

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

      {!trash && (
        <LibraryFilters category={category} onCategory={setCategory} sort={sort} onSort={setSort} />
      )}

      {showGallery && (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Начните с заготовки</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Текст уже расставлен по листу — останется поправить слова
            </p>
          </div>
          <PresetGallery
            category={category}
            size={size}
            busyId={
              create.isPending && create.variables?.presetId ? create.variables.presetId : null
            }
            onPick={onPickPreset}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <PageSizePicker value={size} onChange={setSize} />
            <button
              type="button"
              onClick={() => setScratch(true)}
              className="text-sm text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text)]"
            >
              Или с чистого листа
            </button>
          </div>
        </section>
      )}

      {/* Размер выбирается до создания, а не после: поменять его у документа,
          на котором уже расставлен текст, значит сдвинуть весь макет. */}
      {!trash && scratch && (
        <form
          onSubmit={onCreate}
          className="mb-6 space-y-3 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-medium">Материал с чистого листа</h2>
            <button
              type="button"
              onClick={() => setScratch(false)}
              className="text-sm text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text)]"
            >
              Вернуться к заготовкам
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название нового документа, например «Сертификат участника семинара»"
              className="min-w-64 flex-1"
              autoFocus
            />
            <Select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as DocumentCategory | '')}
              aria-label="Раздел нового материала"
              className="w-56"
            >
              <option value="">Без раздела</option>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
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
      )}

      {documents.isPending && <p className="text-[var(--text-muted)]">Загрузка…</p>}

      {nothingFound && (
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center">
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
              <p className="font-medium">
                {search || category ? 'Ничего не нашлось' : 'Здесь пока пусто'}
              </p>
              {search || category ? (
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Попробуйте изменить запрос или выбрать другой раздел
                </p>
              ) : (
                /* Не пересказываем инструкцию, а показываем на заготовки,
                   которые стоят прямо над этой рамкой: новичок на пустом
                   экране ищет, куда нажать, а не что почитать. */
                <div className="mt-1 text-sm text-[var(--text-muted)]">
                  <p>
                    Начните сверху: выберите заготовку — текст уже расставлен по листу, останется
                    поправить слова.
                  </p>
                  <p className="mt-2">
                    Дальше загрузите свой бланк и подгоните поля: фамилию, место, дату. Ничего
                    страшного не произойдёт — пока вы не выпустили файлы, ничего не расходуется.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((doc) => (
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
