import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, FileText, FolderOpen, LayoutTemplate, Plus, Search } from 'lucide-react';
import { TRASH_DAYS } from '@gramota/shared';
import { api, errorText } from '../api/client';
import { useFolders } from '../api/folders';
import type { DocumentDetail, DocumentList, DocumentSummary } from '../api/types';
import { CreateDocumentPanel } from '../documents/CreateDocumentPanel';
import { DocumentCard } from '../documents/DocumentCard';
import { LibrarySortSelect, type LibrarySort } from '../documents/LibraryFilters';
import { LibraryLayout } from '../documents/LibraryNav';
import { RenameDialog } from '../documents/RenameDialog';
import { UsageBar } from '../documents/UsageBar';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/ErrorState';
import { Input } from '../ui/Field';
import { NextAction } from '../ui/NextAction';
import { PageHeader } from '../ui/PageHeader';
import { SkeletonCards } from '../ui/Skeleton';

const NEW_DOCUMENT = '/documents?new=1';

/**
 * Библиотека материалов.
 *
 * Устроена как файловый менеджер: списки — слева, название списка, поиск
 * и создание — сверху, сколько всего лежит и в каком порядке — снизу.
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
   * Открытая папка и окно «с чистого листа» живут в адресе, а не в состоянии
   * страницы: папки — ссылки в колонке слева, а на создание можно сослаться
   * и открыть его из архива или шаблонов. Иначе окно открывалось бы только
   * с той страницы, где нарисована сама форма.
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
  /** Окно закрываем, папку оставляем: человек вернётся в тот же список. */
  const closeScratch = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete('new');
    next.delete('template');
    setParams(next, { replace: true });
  }, [params, setParams]);

  /*
   * Из архива и шаблонов «Создать» ведёт в рабочие — окно живёт только там.
   * Из папки открывает окно, не теряя папку: новый документ ждут в ней.
   */
  const openScratch = () => {
    if (trash || templates) {
      navigate(NEW_DOCUMENT);
      return;
    }
    const next = new URLSearchParams(params);
    next.set('new', '1');
    setParams(next);
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
   * окно создания, потом закрывается папка. Клавиша делает ровно то же,
   * что стрелка «назад», но не требует тянуться к ней мышью — а в списке
   * из полусотни материалов из папки выходят по многу раз за сеанс.
   *
   * Меню карточки закрывает себя само: если бы Esc срабатывал и здесь,
   * одно нажатие закрывало бы меню и вместе с ним выкидывало из папки.
   * Открытое окно тоже: оно гасит клавишу у себя, сюда она не доходит.
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
  }, [search, scratch, folderId, closeScratch, navigate]);

  const items = documents.data?.items ?? [];
  const nothingFound = documents.data?.items.length === 0;
  const listTitle = trash ? 'Архив' : templates ? 'Шаблоны' : (folder?.name ?? 'Мои документы');

  return (
    <LibraryLayout
      archiveCount={trashCount.data}
      // Открытая папка стоит в заголовке: иначе на половине списка
      // непонятно, почему материалов пять, когда их пятьдесят.
      head={<PageHeader title={listTitle} count={documents.data?.total ?? null} />}
      tools={
        <>
          <div className="relative">
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
            />
            <Input
              compact
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию"
              aria-label="Поиск по названию"
              className="w-40 pl-8 sm:w-56 max-md:h-10 max-md:w-full"
            />
          </div>
          {/* Главное действие стоит в панели, а не в `actions` шапки: на
              телефоне рама раздела оборачивает шапку в кнопку выбора списка,
              и кнопка внутри кнопки — недопустимая разметка. */}
          <Button variant="primary" icon={<Plus size={16} />} data-tour="create-document" onClick={openScratch}>
            <span className="max-md:hidden">Создать документ</span>
            <span className="md:hidden">Создать</span>
          </Button>
        </>
      }
      bar={
        <>
          <span className="tabular text-muted">
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
          // Ключ — чтобы нажатие другого шаблона при открытом окне выбрало его.
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
          <p className="mt-0.5 text-sm text-muted max-md:hidden">
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

        {/* Кнопка пустого места — вторичная везде, кроме самого первого
            документа: залитая уже стоит в панели, и вторая рядом с ней
            спорила бы за внимание. */}
        {nothingFound &&
          (trash ? (
            <NextAction
              icon={Archive}
              title="Архив пока пуст"
              text={`Удалённые документы лежат здесь ${TRASH_DAYS} дней — успеете передумать`}
              secondary={{ label: 'К документам', to: '/documents' }}
            />
          ) : templates && !search ? (
            <NextAction
              icon={LayoutTemplate}
              title="Сохраните первый шаблон"
              text="В меню документа — «Сохранить как шаблон». Получатели и мероприятие в шаблон не попадают."
              secondary={{ label: 'К документам', to: '/documents' }}
            />
          ) : search ? (
            <NextAction
              icon={Search}
              title="Попробуйте другой запрос"
              text={`По запросу «${search}» ничего не нашлось${folder ? ' в этой папке' : ''}`}
              secondary={{ label: 'Сбросить поиск', onClick: () => setSearch('') }}
            />
          ) : folder ? (
            <NextAction
              icon={FolderOpen}
              title="Положите в папку первый документ"
              text="Переложить документ можно из меню карточки — «Переложить в папку». Новый документ, созданный отсюда, ложится в папку сам."
              secondary={{ label: 'Создать в папке', onClick: openScratch }}
            />
          ) : (
            <NextAction
              icon={FileText}
              title="Создайте первый документ"
              text="Загрузите свой бланк и подгоните поля: фамилию, место, дату. Пока вы не выпустили файлы, ничего не расходуется."
              primary={{ label: 'Создать документ', icon: <Plus size={16} />, onClick: openScratch }}
            />
          ))}

        {/* Карточки одного размера, сколько влезет в строку: колонка слева
            съедает ширину, и жёсткие «три в ряд» оставляли бы на широком
            экране пустую половину, а на среднем — сплюснутые листы. */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {items.map((doc, i) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              tour={i === 0 ? 'document-card' : undefined}
              onRename={setRenaming}
              onMove={(d, to) => move.mutate({ id: d.id, folderId: to })}
              onDuplicate={(d) => duplicate.mutate(d.id)}
              onDelete={(d) => remove.mutate(d.id)}
              onRestore={(d) => restore.mutate(d.id)}
              onPurge={(d) => purge.mutate(d.id)}
              onSaveAsTemplate={templates ? undefined : (d) => saveAsTemplate.mutate(d.id)}
            />
          ))}
        </div>
      </section>
      {renaming && (
        <RenameDialog
          initial={renaming.title}
          pending={rename.isPending}
          error={rename.error ? errorText(rename.error) : undefined}
          onSubmit={(title) => rename.mutate({ id: renaming.id, title })}
          onClose={() => setRenaming(null)}
        />
      )}
    </LibraryLayout>
  );
}
