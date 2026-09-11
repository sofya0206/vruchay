import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, FileText, Plus, Search } from 'lucide-react';
import { UsageBar } from '../documents/UsageBar';
import { LibraryLayout } from '../documents/LibraryNav';
import { TRASH_DAYS } from '@gramota/shared';
import { api } from '../api/client';
import type { DocumentDetail, DocumentList, DocumentSummary } from '../api/types';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Field';
import { DocumentCard } from '../documents/DocumentCard';
import { PageSizePicker, type PageSizeValue } from '../documents/PageSizePicker';
import { useFolders } from '../api/folders';
import { LibrarySortSelect, type LibrarySort } from '../documents/LibraryFilters';

/**
 * Библиотека материалов.
 *
 * Устроена как файловый менеджер: списки и создание — слева, название
 * списка и поиск — сверху, сколько всего лежит и в каком порядке — снизу.
 * В середине только свои материалы: папки организация заводит себе сама,
 * в колонке слева.
 *
 * Рабочие и архив — одна страница с двумя адресами, а не переключатель:
 * колонка слева показывает оба списка сразу, и удалённое больше не нужно
 * помнить, чтобы найти.
 */
export function DocumentsPage({ archived = false }: { archived?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('updated');
  const [title, setTitle] = useState('');
  /** `null` — человек ещё не трогал выбор: тогда берём открытую папку. */
  const [newFolderId, setNewFolderId] = useState<string | '' | null>(null);
  // A4 альбомная — то, на чём печатают грамоты чаще всего.
  const [size, setSize] = useState<PageSizeValue>({ widthMm: 297, heightMm: 210 });

  // Какой список смотрим — решает адрес, а не состояние страницы.
  const trash = archived;

  /*
   * Открытая папка и форма «с чистого листа» живут в адресе, а не в состоянии
   * страницы: папки — ссылки в колонке слева, кнопка «Создать» стоит в двух
   * местах рамки раздела. Иначе на папку нельзя было бы сослаться, а создание
   * открывалось бы только с той страницы, где нарисована сама форма.
   *
   * Чужой идентификатор в `?folder=` — не ошибка, а испорченная ссылка: молча
   * показываем все материалы, а не пустой список по несуществующей папке.
   */
  const folders = useFolders();
  const raw = !trash ? params.get('folder') : null;
  const folder = (folders.data ?? []).find((f) => f.id === raw) ?? null;
  const folderId = folder?.id ?? null;

  const scratch = !trash && params.get('new') === '1';
  /** Форму закрываем, папку оставляем: человек вернётся в тот же список. */
  const closeScratch = () => {
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  };

  const documents = useQuery({
    queryKey: ['documents', search, trash, folderId, sort],
    queryFn: () =>
      api.get<DocumentList>(
        `/documents?limit=50&trashed=${trash}&sort=${sort}` +
          (search ? `&search=${encodeURIComponent(search)}` : '') +
          (folderId ? `&folderId=${folderId}` : ''),
      ),
  });

  // Счётчик архива нужен и когда мы его не смотрим: иначе про удалённое
  // просто забывают, а оно через неделю исчезает насовсем.
  const trashCount = useQuery({
    queryKey: ['documents-trash-count'],
    queryFn: () => api.get<DocumentList>('/documents?limit=1&trashed=true'),
    select: (d) => d.total,
  });

  const create = useMutation({
    mutationFn: (v: { title: string; folderId?: string }) =>
      api.post<DocumentDetail>('/documents', {
        title: v.title,
        pageWidthMm: size.widthMm,
        pageHeightMm: size.heightMm,
        ...(v.folderId ? { folderId: v.folderId } : {}),
      }),
    onSuccess: () => {
      setTitle('');
      setNewFolderId(null);
      closeScratch();
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  /** После любого действия обновляем и список, и счётчик архива. */
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

  /** Переложить материал в другую папку. `null` — вынуть из папок совсем. */
  const move = useMutation({
    mutationFn: (v: { id: string; folderId: string | null }) =>
      api.patch<DocumentDetail>(`/documents/${v.id}`, { folderId: v.folderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });

  function onRename(doc: DocumentSummary) {
    const title = window.prompt('Новое название документа', doc.title)?.trim();
    if (title && title !== doc.title) rename.mutate({ id: doc.id, title });
  }

  /** Что стоит в выборе папки: тронутое человеком или открытая папка. */
  const formFolderId = newFolderId ?? folderId ?? '';

  /*
   * Esc — шаг назад по уровням: сначала снимается поиск, потом закрывается
   * форма создания, потом закрывается папка. Клавиша делает ровно то же,
   * что стрелка «назад», но не требует тянуться к ней мышью — а в списке
   * из полусотни материалов из папки выходят по многу раз за сеанс.
   *
   * Меню карточки закрывает себя само: если бы Esc срабатывал и здесь,
   * одно нажатие закрывало бы меню и вместе с ним выкидывало из папки.
   *
   * Разобранное нажатие помечаем `preventDefault`: над разделом стоит
   * оболочка кабинета, которая по Esc уводит на главную. Без пометки одно
   * нажатие снимало бы поиск и тут же выбрасывало из раздела совсем.
   * Когда разбирать нечего — не мешаем: Esc уходит наверх и закрывает
   * раздел, как и в любом другом.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="menu"]')) return;
      if (search) {
        e.preventDefault();
        setSearch('');
        return;
      }
      if (scratch) {
        e.preventDefault();
        closeScratch();
        return;
      }
      if (folderId) {
        e.preventDefault();
        navigate('/documents');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (title.trim()) {
      create.mutate({ title: title.trim(), folderId: formFolderId || undefined });
    }
  }

  const items = documents.data?.items ?? [];
  const nothingFound = documents.data?.items.length === 0;

  return (
    <LibraryLayout
      archiveCount={trashCount.data}
      head={
        <div className="flex min-w-0 items-baseline gap-2">
          {/* Открытая папка стоит в заголовке: иначе на половине списка
              непонятно, почему материалов пять, когда их пятьдесят. */}
          <h1 className="truncate text-lg font-medium">
            {trash ? 'Архив' : (folder?.name ?? 'Мои документы')}
          </h1>
          {documents.data && (
            <span className="tabular text-sm text-[var(--text-muted)]">{documents.data.total}</span>
          )}
        </div>
      }
      tools={
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию"
            aria-label="Поиск по названию"
            className="w-40 py-1.5 pl-9 text-sm sm:w-56"
          />
        </div>
      }
      bar={
        <>
          <span className="tabular text-[var(--text-muted)]">
            {trash ? 'В архиве' : 'Документов'}: {documents.data?.total ?? 0}
          </span>
          <div className="ml-auto">
            <LibrarySortSelect sort={sort} onSort={setSort} />
          </div>
        </>
      }
    >
      {/* Остаток пробы — до всего остального: человек должен знать,
            сколько у него есть, ещё до того как начнёт награждение,
            а не упереться в предел на сорок седьмом документе. */}
      {!trash && <UsageBar />}

      {/* Размер выбирается до создания, а не после: поменять его у документа,
          на котором уже расставлен текст, значит сдвинуть весь макет. */}
      {scratch && (
        <form
          onSubmit={onCreate}
          className="mb-6 space-y-3 rounded-xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-medium">Материал с чистого листа</h2>
            <button
              type="button"
              onClick={closeScratch}
              className="text-sm text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text)]"
            >
              Вернуться к списку
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
            {/* Внутри папки она и подставлена: человек нажал «Создать»,
                стоя в своей папке, — материал ждут там же. Выбрать другую
                или «Вне папок» по-прежнему можно. Пока папок нет, выбирать
                не из чего — тогда поля нет вовсе. */}
            {(folders.data ?? []).length > 0 && (
              <Select
                value={formFolderId}
                onChange={(e) => setNewFolderId(e.target.value)}
                aria-label="Папка нового материала"
                className="w-56"
              >
                <option value="">Вне папок</option>
                {(folders.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            )}
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

      <section>
        <div className="mb-3">
          <h2 className="font-medium">{trash ? 'Удалённые' : 'Документы'}</h2>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {trash ? (
              <>Удалённое хранится {TRASH_DAYS} дней, потом стирается насовсем</>
            ) : folder ? (
              <>Материалы этой папки</>
            ) : (
              <>Грамоты, дипломы, сертификаты, благодарности — что угодно на бланке</>
            )}
          </p>
        </div>

        {documents.isPending && <p className="text-[var(--text-muted)]">Загрузка…</p>}

        {nothingFound && (
          <div className="rounded-xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center">
            {trash ? (
              <>
                <Archive
                  size={28}
                  className="mx-auto mb-3 text-[var(--text-muted)]"
                  strokeWidth={1.5}
                />
                <p className="font-medium">Архив пуст</p>
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
                  {search ? 'Ничего не нашлось' : folder ? 'Папка пуста' : 'Здесь пока пусто'}
                </p>
                {search ? (
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Попробуйте изменить запрос или открыть другую папку
                  </p>
                ) : folder ? (
                  /* Говорим, как сюда что-то положить: папка, в которую нельзя
                     ничего переложить, выглядит сломанной, а не пустой. */
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Переложить сюда материал можно из меню карточки в{' '}
                    <Link to="/documents" className="underline underline-offset-4">
                      рабочих
                    </Link>{' '}
                    — «Переложить в папку». Новый материал кладётся в папку при создании.
                  </p>
                ) : (
                  /* Не пересказываем инструкцию, а показываем дорогу: новичок
                     на пустом экране ищет, куда нажать, а не что почитать. */
                  <div className="mt-1 text-sm text-[var(--text-muted)]">
                    <p>
                      Нажмите «Создать документ», загрузите свой бланк и подгоните поля: фамилию,
                      место, дату.
                    </p>
                    <p className="mt-2">
                      Ничего страшного не произойдёт — пока вы не выпустили файлы, ничего
                      не расходуется.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Карточки одного размера, сколько влезет в строку: колонка слева
            съедает ширину, и жёсткие «три в ряд» оставляли бы на широком
            экране пустую половину, а на среднем — сплюснутые листы. */}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {items.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onRename={onRename}
              onMove={(d, to) => move.mutate({ id: d.id, folderId: to })}
              onDuplicate={(d) => duplicate.mutate(d.id)}
              onDelete={(d) => remove.mutate(d.id)}
              onRestore={(d) => restore.mutate(d.id)}
              onPurge={(d) => purge.mutate(d.id)}
            />
          ))}
        </ul>
      </section>
    </LibraryLayout>
  );
}
