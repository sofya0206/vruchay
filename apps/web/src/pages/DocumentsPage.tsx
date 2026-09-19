import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, FileText, LayoutTemplate, Plus, Search } from 'lucide-react';
import { UsageBar } from '../documents/UsageBar';
import { LibraryLayout } from '../documents/LibraryNav';
import { TRASH_DAYS } from '@gramota/shared';
import { api } from '../api/client';
import type { DocumentDetail, DocumentList, DocumentSummary } from '../api/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { DocumentCard } from '../documents/DocumentCard';
import { CreateDocumentPanel } from '../documents/CreateDocumentPanel';
import { useFolders } from '../api/folders';
import { LibrarySortSelect, type LibrarySort } from '../documents/LibraryFilters';
import { RenameDialog } from '../documents/RenameDialog';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { SkeletonCards } from '../ui/Skeleton';

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
export function DocumentsPage({
  archived = false,
  templates = false,
}: {
  archived?: boolean;
  /** Раздел шаблонов: карточки по нажатию дают новый документ. */
  templates?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LibrarySort>('updated');
  /** Материал, который переименовывают в окне. */
  const [renaming, setRenaming] = useState<DocumentSummary | null>(null);

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
  const raw = !trash && !templates ? params.get('folder') : null;
  const folder = (folders.data ?? []).find((f) => f.id === raw) ?? null;
  const folderId = folder?.id ?? null;

  const scratch = !trash && !templates && params.get('new') === '1';
  /** Шаблон, с которого начать, — из карточки в разделе «Шаблоны». */
  const fromTemplate = scratch ? params.get('template') : null;
  /** Форму закрываем, папку оставляем: человек вернётся в тот же список. */
  const closeScratch = () => {
    const next = new URLSearchParams(params);
    next.delete('new');
    next.delete('template');
    setParams(next, { replace: true });
  };

  const documents = useQuery({
    queryKey: ['documents', search, trash, templates, folderId, sort],
    queryFn: () =>
      api.get<DocumentList>(
        `/documents?limit=50&trashed=${trash}&templates=${templates}&sort=${sort}` +
          (search ? `&search=${encodeURIComponent(search)}` : '') +
          (folderId ? `&folderId=${folderId}` : ''),
      ),
    // Пока грузится другая папка, на экране остаётся прежний список, а не
    // пустое место: переключение не мигает и не прыгает прокруткой.
    placeholderData: keepPreviousData,
  });

  // Другая папка — список с начала: прежняя прокрутка к новому списку
  // отношения не имеет.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [folderId, trash, templates]);

  // Счётчик архива нужен и когда мы его не смотрим: иначе про удалённое
  // просто забывают, а оно через неделю исчезает насовсем.
  const trashCount = useQuery({
    queryKey: ['documents-trash-count'],
    queryFn: () => api.get<DocumentList>('/documents?limit=1&trashed=true'),
    select: (d) => d.total,
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
    onSuccess: () => {
      setRenaming(null);
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  /* Шаблон — копия документа, поэтому после сохранения ведём к шаблонам:
     там видно, что он появился и что сам документ остался на месте. */
  const saveAsTemplate = useMutation({
    mutationFn: (id: string) => api.post<DocumentDetail>(`/documents/${id}/template`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      navigate('/documents/templates');
    },
  });

  /** Переложить материал в другую папку. `null` — вынуть из папок совсем. */
  const move = useMutation({
    mutationFn: (v: { id: string; folderId: string | null }) =>
      api.patch<DocumentDetail>(`/documents/${v.id}`, { folderId: v.folderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });


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
            {trash ? 'Архив' : templates ? 'Шаблоны' : (folder?.name ?? 'Мои документы')}
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
            className="w-40 py-1.5 pl-9 text-sm max-md:h-11 max-md:w-full sm:w-56"
          />
        </div>
      }
      bar={
        <>
          <span className="tabular text-[var(--text-muted)]">
            {trash ? 'В архиве' : templates ? 'Шаблонов' : 'Документов'}: {documents.data?.total ?? 0}
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
      {!trash && !templates && <UsageBar />}

      {scratch && (
        <CreateDocumentPanel
          // Ключ — чтобы нажатие другого шаблона при открытой панели выбрало его.
          key={fromTemplate ?? 'blank'}
          initialTemplateId={fromTemplate}
          initialFolderId={folderId}
          onClose={closeScratch}
        />
      )}

      <section>
        <div className="mb-3">
          <h2 className="font-medium">
            {trash ? 'Удалённые' : templates ? 'Шаблоны организации' : 'Документы'}
          </h2>
          {/* Пояснение раздела на телефоне не показываем: там и так тесно,
              а что в разделе — видно по карточкам. */}
          <p className="mt-0.5 text-sm text-[var(--text-muted)] max-md:hidden">
            {trash ? (
              <>Удалённое хранится {TRASH_DAYS} дней, потом стирается насовсем</>
            ) : templates ? (
              <>Нажмите на шаблон — получите новый документ с его макетом</>
            ) : folder ? (
              <>Материалы этой папки</>
            ) : (
              <>Грамоты, дипломы, сертификаты, благодарности — что угодно на бланке</>
            )}
          </p>
        </div>

        {documents.isPending && <SkeletonCards label="Открываем документы" />}

        {documents.isError && (
          <ErrorState
            title="Документы не открылись"
            onRetry={() => void documents.refetch()}
            retrying={documents.isFetching}
            code={String(documents.error)}
          />
        )}

        {nothingFound &&
          (trash ? (
            <EmptyState icon={Archive} title="Архив пуст">
              Удалённые материалы лежат здесь {TRASH_DAYS} дней — успеете передумать
            </EmptyState>
          ) : templates && !search ? (
            <EmptyState icon={LayoutTemplate} title="Шаблонов пока нет">
              В меню документа — «Сохранить как шаблон». Получатели и мероприятие в шаблон
              не попадают.
            </EmptyState>
          ) : search ? (
            <EmptyState icon={FileText} title="Ничего не нашлось">
              Попробуйте изменить запрос или открыть другую папку
            </EmptyState>
          ) : folder ? (
            <EmptyState icon={FileText} title="Папка пуста">
              Переложить сюда материал можно из меню карточки в{' '}
              <Link to="/documents" className="underline underline-offset-4">
                рабочих
              </Link>{' '}
              — «Переложить в папку». Новый материал кладётся в папку при создании.
            </EmptyState>
          ) : (
            <EmptyState
              icon={FileText}
              title="Здесь пока пусто"
              action={
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/documents?new=1')}>
                  Создать документ
                </Button>
              }
            >
              Загрузите свой бланк и подгоните поля: фамилию, место, дату. Пока вы не выпустили
              файлы, ничего не расходуется.
            </EmptyState>
          ))}

        {/* Карточки одного размера, сколько влезет в строку: колонка слева
            съедает ширину, и жёсткие «три в ряд» оставляли бы на широком
            экране пустую половину, а на среднем — сплюснутые листы. */}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {items.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onRename={setRenaming}
              onMove={(d, to) => move.mutate({ id: d.id, folderId: to })}
              onDuplicate={(d) => duplicate.mutate(d.id)}
              onDelete={(d) => remove.mutate(d.id)}
              onRestore={(d) => restore.mutate(d.id)}
              onPurge={(d) => purge.mutate(d.id)}
              onSaveAsTemplate={templates ? undefined : (d) => saveAsTemplate.mutate(d.id)}
            />
          ))}
        </ul>
      </section>
      {renaming && (
        <RenameDialog
          initial={renaming.title}
          pending={rename.isPending}
          error={rename.error?.message}
          onSubmit={(title) => rename.mutate({ id: renaming.id, title })}
          onClose={() => setRenaming(null)}
        />
      )}
    </LibraryLayout>
  );
}
