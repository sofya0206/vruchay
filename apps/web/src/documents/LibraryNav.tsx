import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutTemplate,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { errorText } from '../api/client';
import {
  useCreateFolder,
  useDeleteFolder,
  useFolders,
  useRenameFolder,
  useReorderFolders,
  type Folder as FolderItem,
} from '../api/folders';
import { ConfirmDialog } from '../ui/Dialog';
import { usePhone } from '../ui/useMediaQuery';
import { SectionLayout, columnRowClass } from '../ui/SectionLayout';
import { cn } from '../ui/cn';
import { useTooltip } from '../ui/Tooltip';

/**
 * Рамка раздела «Награждение»: колонка разделов слева, панель сверху,
 * строка состояния снизу.
 *
 * Раздел устроен как файловый менеджер, а не как страница: слева стоят
 * списки и кнопка создания, сверху — название текущего списка, поиск
 * и то же создание под правой рукой, снизу — сколько всего лежит
 * и в каком порядке показано. Так работают все программы, из которых
 * сюда приходят, и человеку не приходится заново искать, куда нажимать.
 *
 * Колонка и обе полосы приклеены: список материалов длинный, а «сколько
 * их всего» и «создать» нужны в любой момент прокрутки, а не только
 * в самом верху.
 *
 * Раньше «Корзина» была переключателем над списком и появлялась, только
 * когда в ней что-то лежало, — то есть найти удалённое можно было, лишь
 * помня, что оно там. Здесь оба списка видны сразу и у каждого свой адрес:
 * на архив можно сослаться, а «Назад» в браузере возвращает в рабочие.
 *
 * Слово «Архив», а не «Корзина»: удалённый материал не мусор — из него
 * заново выпускают через год, когда мероприятие повторяется.
 */
interface Item {
  to: string;
  label: string;
  icon: typeof FileText;
  /** Открыт ли этот список прямо сейчас. Считаем сами, а не `NavLink`: у папок
      разделов один и тот же адрес и разный `?category=`, а `NavLink` о том,
      что стоит после вопросительного знака, ничего не знает. */
  active: boolean;
  /** Сколько лежит внутри. Ноль не рисуем — пустое место честнее нуля. */
  count?: number | null;
  /** Папка — вложена в «Мои документы» и подписана мельче. */
  nested?: boolean;
}

/**
 * Создание материала — ссылка, а не кнопка с состоянием.
 *
 * Стоит в двух местах сразу: в колонке слева и в правом углу панели.
 * Обе ведут в один адрес `/documents?new=1`, поэтому создание открывается
 * и из архива, и из шаблонов, и по прямой ссылке, а страница не хранит
 * отдельного «открыта ли форма» — это решает адрес.
 */
function CreateLink({ label, className = '' }: { label: string; className?: string }) {
  return (
    <Link
      to="/documents?new=1"
      className={
        'inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 max-md:h-11 ' +
        'text-sm font-medium whitespace-nowrap text-[var(--accent-contrast)] transition-colors ' +
        `hover:bg-[var(--accent-hover)] ${className}`
      }
    >
      <Plus size={16} />
      {label}
    </Link>
  );
}

/**
 * Папки материалов — в колонке, а не лентой кнопок над списком.
 *
 * Лента съедала строку над каждым списком и всё равно читалась как фильтр,
 * который кто-то забыл выключить. В колонке папки стоят там, где человек
 * их ищет, и у каждой свой адрес: на папку можно дать ссылку, а «Назад»
 * возвращает ко всем материалам.
 *
 * Папки организация заводит себе сама: раньше здесь стоял зашитый в код
 * список из пяти разделов, и тот, кто проводит семинары, читал его
 * как чужой шаблон.
 *
 * «Мои документы» — корень: нажатие открывает весь список и складывает
 * папки, как в любом проводнике. Раскрыть обратно — уголком справа.
 *
 * Правая кнопка работает и на корне, и на папке: это то место, где её ищут,
 * придя из проводника или с диска. У папки то же меню открывает «…»,
 * а на сенсорном экране правую кнопку заменяет долгое нажатие.
 */
export function LibraryNav({ archiveCount }: { archiveCount?: number | null }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const openFolderId = params.get('folder');
  const onDocuments = pathname === '/documents';
  const [expanded, setExpanded] = useState(true);
  const [creating, setCreating] = useState(false);
  /** Папка, имя которой правят прямо в строке. */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  /** Где открыто меню и для какой папки. `folder: null` — меню корня. */
  const [menu, setMenu] = useState<{ x: number; y: number; folder: FolderItem | null } | null>(
    null,
  );
  /** Папка, удаление которой ждёт подтверждения. */
  const [deleting, setDeleting] = useState<FolderItem | null>(null);
  /*
   * Телефон: колонка живёт в нижнем листе раздела, и сворачивать папки
   * там незачем — стрелка раскрытия только мешала. Папки видны всегда.
   */
  const phone = usePhone();
  const showFolders = expanded || phone;

  const folders = useFolders();
  const create = useCreateFolder();
  const rename = useRenameFolder();
  const remove = useDeleteFolder();
  const reorder = useReorderFolders();

  /** Папка, которую тащат, и та, над которой её держат. */
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  /*
   * Те же значения в ссылках — для обработчиков переноса. `dragover`
   * приходит десятки раз в секунду, и читать состояние из замыкания
   * прошлого кадра нельзя; а ставить состояние на каждое событие —
   * значит перерисовывать колонку на каждое движение мыши.
   */
  const dragRef = useRef<string | null>(null);
  const overRef = useRef<string | null>(null);

  const list = folders.data ?? [];

  /** Переставить папку на новое место и отправить весь порядок целиком. */
  const moveFolder = (id: string, to: number) => {
    const ids = list.map((f) => f.id);
    const from = ids.indexOf(id);
    if (from === -1 || to < 0 || to >= ids.length || from === to) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder(ids);
  };

  /**
   * С какой стороны целевой папки рисовать линию вставки.
   *
   * Тащим вверх — папка встанет перед целью, вниз — после неё. Линия
   * поверху и линия понизу у соседних строк совпали бы, поэтому сторону
   * считаем от направления, а не рисуем всегда сверху.
   */
  const insertSide = (targetId: string): 'before' | 'after' | null => {
    if (!dragId || overId !== targetId || dragId === targetId) return null;
    const from = list.findIndex((f) => f.id === dragId);
    const to = list.findIndex((f) => f.id === targetId);
    if (from === -1 || to === -1) return null;
    return to < from ? 'before' : 'after';
  };

  const markOver = (id: string | null) => {
    if (overRef.current === id) return;
    overRef.current = id;
    setOverId(id);
  };

  const endDrag = () => {
    dragRef.current = null;
    overRef.current = null;
    setDragId(null);
    setOverId(null);
  };

  /*
   * Перенос принимает весь список, а не каждая строка отдельно.
   *
   * Между строками зазор в четыре точки. Когда бросок принимали строки,
   * в зазоре браузер считал место запретным: курсор мигал «нельзя» при
   * каждом переходе со строки на строку, а папка, отпущенная в зазоре,
   * не ложилась никуда. Теперь зазор принадлежит строке, над которой
   * курсор был последней, — линия вставки стоит на месте и не мигает.
   *
   * Над «Моими документами», кнопкой «Папка» и «Архивом» положить папку
   * некуда — там линия гаснет, и курсор честно показывает запрет.
   */
  const dragHandlers = {
    onDragOver: (e: DragEvent<HTMLUListElement>) => {
      if (!dragRef.current) return;
      const row = (e.target as HTMLElement).closest('li');
      const folderId = row?.dataset.folderId;
      if (row && !folderId) {
        markOver(null);
        return;
      }
      if (folderId) markOver(folderId);
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDragLeave: (e: DragEvent<HTMLUListElement>) => {
      // Ушли за пределы списка — линия не должна висеть над последней
      // строкой, обещая бросок, которого не будет. Проверяем по
      // координатам: Safari не сообщает, куда ушёл указатель.
      const box = e.currentTarget.getBoundingClientRect();
      const inside =
        e.clientX > box.left && e.clientX < box.right && e.clientY > box.top && e.clientY < box.bottom;
      if (!inside) markOver(null);
    },
    onDrop: (e: DragEvent<HTMLUListElement>) => {
      const source = dragRef.current;
      const target = overRef.current;
      if (!source) return;
      e.preventDefault();
      if (target && target !== source) {
        moveFolder(source, list.findIndex((f) => f.id === target));
      }
      endDrag();
    },
  };

  /*
   * Открытая папка обязана быть видна, даже если дерево было сложено:
   * по ссылке из письма, по «Назад» в браузере или по Esc человек попадает
   * в папку, и подсвечивать нечего, когда строки нет на экране.
   */
  useEffect(() => {
    if (openFolderId) setExpanded(true);
  }, [openFolderId]);

  const openMenu = (e: MouseEvent<HTMLElement>, folder: FolderItem | null) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, folder });
  };

  const startFolder = () => {
    setExpanded(true);
    setCreating(true);
  };

  /** Новый материал заводится сразу в той папке, из которой вызвано меню. */
  const startDocument = (folder: FolderItem | null) => {
    navigate(`/documents?${folder ? `folder=${folder.id}&` : ''}new=1`);
  };

  const archive: Item[] = [
    {
      to: '/documents/templates',
      label: 'Шаблоны',
      icon: LayoutTemplate,
      active: pathname === '/documents/templates',
    },
    {
      to: '/documents/archive',
      label: 'Архив',
      icon: Archive,
      active: pathname === '/documents/archive',
      count: archiveCount,
    },
  ];

  return (
    <nav aria-label="Разделы библиотеки" className="mt-3 max-md:mt-0">
      <div>
        <ul className="flex flex-col gap-1" {...dragHandlers}>
          <RootRow
            active={onDocuments && !openFolderId}
            expanded={expanded}
            onCollapse={() => !phone && setExpanded(false)}
            onToggle={() => setExpanded((v) => !v)}
            onMenu={(e) => openMenu(e, null)}
          />
          {showFolders &&
            list.map((folder) =>
              renamingId === folder.id ? (
                <li key={folder.id}>
                  <FolderNameForm
                    initial={folder.name}
                    busy={rename.isPending}
                    error={rename.error ? errorText(rename.error) : undefined}
                    onCancel={() => setRenamingId(null)}
                    onSubmit={(name) =>
                      rename.mutate(
                        { id: folder.id, name },
                        { onSuccess: () => setRenamingId(null) },
                      )
                    }
                  />
                </li>
              ) : (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  active={onDocuments && openFolderId === folder.id}
                  onMenu={(e) => openMenu(e, folder)}
                  dragging={dragId === folder.id}
                  over={insertSide(folder.id)}
                  onDragStart={() => {
                    dragRef.current = folder.id;
                    setDragId(folder.id);
                  }}
                  onDragEnd={endDrag}
                />
              ),
            )}
          {showFolders && creating && (
            <li>
              <FolderNameForm
                busy={create.isPending}
                error={create.error ? errorText(create.error) : undefined}
                onCancel={() => setCreating(false)}
                onSubmit={(name) => create.mutate(name, { onSuccess: () => setCreating(false) })}
              />
            </li>
          )}
          {/* Завести папку было можно только правой кнопкой по «Моим
              документам». Правую кнопку в вебе почти никто не пробует, и
              первая папка не заводилась вовсе — поэтому здесь есть строка,
              которую видно. */}
          {showFolders && !creating && (
            <li>
              <button
                type="button"
                onClick={startFolder}
                className={cn(columnRowClass({ nested: true }), 'w-full text-left')}
              >
                <FolderPlus size={14} strokeWidth={1.75} className="shrink-0" />
                <span>Папка</span>
              </button>
            </li>
          )}
          {archive.map((item) => (
            <Row key={item.to} item={item} />
          ))}
        </ul>

      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          folder={menu.folder}
          onClose={() => setMenu(null)}
          onNewDocument={() => startDocument(menu.folder)}
          onNewFolder={startFolder}
          onRename={() => menu.folder && setRenamingId(menu.folder.id)}
          onDelete={() => setDeleting(menu.folder)}
          position={menu.folder ? list.findIndex((f) => f.id === menu.folder!.id) : -1}
          total={list.length}
          onMove={(to) => menu.folder && moveFolder(menu.folder.id, to)}
        />
      )}

      {/* В body: колонка липкая, а липкий блок — свой слой, и карточки
          списка ложились поверх окна вместе с его строкой ошибки. */}
      {deleting &&
        createPortal(
          <ConfirmDialog
            title={`Удалить папку «${deleting.name}»?`}
            confirmLabel="Удалить папку"
            danger
            pending={remove.isPending}
            error={remove.error ? errorText(remove.error) : null}
            onClose={() => {
              setDeleting(null);
              remove.reset();
            }}
            onConfirm={() =>
              remove.mutate(deleting.id, {
                onSuccess: () => {
                  setDeleting(null);
                  if (openFolderId === deleting.id) navigate('/documents');
                },
              })
            }
          >
            Материалы останутся — вернутся в «Мои документы».
          </ConfirmDialog>,
          document.body,
        )}
    </nav>
  );
}

/**
 * Меню папки: то же самое по правой кнопке и по «…».
 *
 * Стоит по месту нажатия, а не под строкой: правой кнопкой вызывают там,
 * где смотрят, и меню, всплывающее в другом углу, приходится искать глазами.
 *
 * Рисуется порталом в body, а не на месте в колонке. Колонка приклеена
 * (`position: sticky`), а приклеенный блок заводит свой контекст наложения:
 * внутри него `z-50` меню ничего не значит рядом с карточками материалов,
 * которые лежат в соседней колонке и рисуются позже. Меню уходило под них
 * нижней половиной — «Удалить папку» оказывалось под карточкой.
 */
function ContextMenu({
  x,
  y,
  folder,
  onClose,
  onNewDocument,
  onNewFolder,
  onRename,
  onDelete,
  position,
  total,
  onMove,
}: {
  x: number;
  y: number;
  folder: FolderItem | null;
  onClose: () => void;
  onNewDocument: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  /** Который по счёту стоит папка сейчас; -1 — меню корня. */
  position: number;
  total: number;
  onMove: (to: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return createPortal(
    <>
      {/* Подложка ловит нажатие мимо меню и прокрутку под ним: меню стоит
          по координатам курсора и вместе со страницей не едет. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div
        role="menu"
        // Меню у правого или нижнего края уехало бы за экран, поэтому
        // упираем его в край с небольшим полем.
        style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 200) }}
        className="card fixed z-50 w-56 overflow-hidden py-1 shadow-lg"
      >
        <p className="truncate px-3 pt-1 pb-2 text-xs text-[var(--text-muted)]">
          {folder ? folder.name : 'Мои документы'}
        </p>
        <MenuItem icon={<FileText size={14} />} onClick={run(onNewDocument)}>
          {folder ? 'Новый документ в папке' : 'Новый документ'}
        </MenuItem>
        {/* «Новая папка» — только в корне: папки плоские, вложенности нет,
            и в меню самой папки этот пункт обещал бы подпапку, а заводил
            бы соседнюю рядом с ней. */}
        {!folder && (
          <MenuItem icon={<FolderPlus size={14} />} onClick={run(onNewFolder)}>
            Новая папка
          </MenuItem>
        )}
        {folder && (
          <>
            <div className="my-1 border-t border-[var(--line)]" />
            {/* Перетаскивание мышью недоступно с клавиатуры, а на сенсорном
                экране требует точности, которой там нет. Те же два шага
                словами — здесь. */}
            <MenuItem
              icon={<ArrowUp size={14} />}
              disabled={position <= 0}
              onClick={run(() => onMove(position - 1))}
            >
              Выше
            </MenuItem>
            <MenuItem
              icon={<ArrowDown size={14} />}
              disabled={position < 0 || position >= total - 1}
              onClick={run(() => onMove(position + 1))}
            >
              Ниже
            </MenuItem>
            <div className="my-1 border-t border-[var(--line)]" />
            <MenuItem icon={<Pencil size={14} />} onClick={run(onRename)}>
              Переименовать
            </MenuItem>
            <MenuItem icon={<Trash2 size={14} />} danger onClick={run(onDelete)}>
              Удалить папку
            </MenuItem>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

/**
 * Строка папки: ссылка плюс «…», открывающее то же меню, что правая кнопка.
 *
 * Имя — в одну строку с многоточием. Три строки, стоявшие здесь раньше,
 * ради длинных названий растягивали строку до 68 точек при 32 у соседей:
 * подсветка получалась крупнее самой папки. Целиком имя показывает
 * подсказка, и только когда оно действительно не поместилось.
 *
 * Счётчик и «…» стоят в одном месте друг над другом и меняются
 * прозрачностью, а не появлением: строка не должна дёргаться от того,
 * что по ней провели мышью.
 *
 * Вложенность держится одним отступом: направляющая линия вдоль папок
 * рябила в глазах и спорила с рамкой колонки.
 */
function FolderRow({
  folder,
  active,
  onMenu,
  dragging,
  over,
  onDragStart,
  onDragEnd,
}: {
  folder: FolderItem;
  active: boolean;
  onMenu: (e: MouseEvent<HTMLElement>) => void;
  dragging: boolean;
  /** С какой стороны ляжет папка, если отпустить здесь. */
  over: 'before' | 'after' | null;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const name = useRef<HTMLSpanElement>(null);
  const { triggerProps, tooltip } = useTooltip(folder.name, {
    onlyWhenTruncated: true,
    describes: true,
    placement: 'right',
    measure: name,
  });

  const handleDragStart = (e: DragEvent<HTMLLIElement>) => {
    // Без этого Firefox не начинает перетаскивание вовсе.
    e.dataTransfer.setData('text/plain', folder.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart();
  };

  return (
    <li
      draggable
      data-folder-id={folder.id}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={onMenu}
      className={cn(
        'group relative flex items-center md:cursor-grab md:active:cursor-grabbing',
        dragging && 'opacity-40',
        /* Куда ляжет папка — линия на границе, а не рамка вокруг строки:
           рамка показывала «эта папка», хотя вопрос был «между какими». */
        over &&
          'after:absolute after:inset-x-2 after:z-10 after:h-0.5 after:rounded-full after:bg-[var(--accent)] after:content-[""]',
        // Ровно посередине четырёхточечного зазора: линия у края строки
        // читалась как её подчёркивание, а не как место между двумя.
        over === 'before' && 'after:-top-[3px]',
        over === 'after' && 'after:-bottom-[3px]',
      )}
    >
      <Link
        to={`/documents?folder=${folder.id}`}
        aria-current={active ? 'page' : undefined}
        /* Ссылка перетаскивается браузером сама по себе — как адрес, с
           призраком из одного слова. Перетаскивать должна строка целиком. */
        draggable={false}
        {...triggerProps}
        className={cn(
          columnRowClass({ active, nested: true }),
          /* Постоянное место под счётчик и «…»: без него ширина имени
             менялась бы от того, есть ли у папки материалы. Обязательно
             с `md:` — базовый `pr-*` проиграл бы `md:px-2` из общего
             стиля, и счётчик лёг бы прямо на имя. */
          'pr-7 md:pr-7',
        )}
      >
        <Folder size={14} strokeWidth={1.75} className="shrink-0" />
        <span ref={name} className="min-w-0 md:flex-1 md:truncate">
          {folder.name}
        </span>
      </Link>
      {tooltip}

      {folder.count ? (
        <span className="tabular pointer-events-none absolute right-2 text-xs text-[var(--text-muted)] transition-opacity max-md:hidden md:group-hover:opacity-0">
          {folder.count}
        </span>
      ) : null}

      <button
        type="button"
        onClick={onMenu}
        aria-label={`Меню папки «${folder.name}»`}
        className="absolute right-0 px-1.5 py-1.5 text-[var(--text-muted)] transition-opacity hover:text-[var(--text)] focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
      >
        <MoreHorizontal size={15} strokeWidth={1.75} />
      </button>
    </li>
  );
}

function MenuItem({
  icon,
  children,
  danger = false,
  disabled = false,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  danger?: boolean;
  /** Крайняя папка никуда не двигается — пункт виден, но не нажимается:
      исчезающий пункт менял бы высоту меню от папки к папке. */
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-40 hover:bg-[var(--surface-sunken)] ' +
        (danger ? 'text-[var(--danger)]' : 'text-[var(--text)]')
      }
    >
      <span className="shrink-0 text-[var(--text-muted)]">{icon}</span>
      {children}
    </button>
  );
}

/** Поле имени папки: и для новой, и для переименования — правила одни. */
function FolderNameForm({
  initial = '',
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  busy: boolean;
  /** Сообщение сервера: чаще всего «Папка с таким названием уже есть». */
  error?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  /*
   * Отправляем ровно один раз.
   *
   * На Enter поле блокируется на время запроса, блокировка снимает фокус,
   * и `onBlur` отправлял то же имя вторым запросом: папка заводилась,
   * а поле появлялось снова — уже с ошибкой «такое название уже есть».
   * Уход фокуса после отправки — это её последствие, а не второе согласие.
   *
   * Снимается защита только правкой текста: одно введённое имя — одна
   * попытка. После отказа сервера человек исправляет название, и поле
   * снова отзывается.
   */
  const sent = useRef(false);

  useEffect(() => {
    input.current?.select();
  }, []);

  const submit = () => {
    if (sent.current) return;
    const value = name.trim();
    if (!value) return;
    sent.current = true;
    onSubmit(value);
  };

  const cancel = () => {
    sent.current = true;
    onCancel();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="px-3 py-1 md:pr-2 md:pl-5"
    >
      <input
        ref={input}
        value={name}
        autoFocus
        disabled={busy}
        maxLength={100}
        onChange={(e) => {
          sent.current = false;
          setName(e.target.value);
        }}
        // Esc отменяет, а уход мышью сохраняет: человек напечатал имя
        // и нажал в список — это согласие, а не отказ.
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
          /*
           * Enter обрабатываем сами, а не неявной отправкой формы: в форме
           * одно поле и нет кнопки отправки, и браузеры расходятся в том,
           * отправлять ли такую форму по Enter. Ошибиться тут нельзя —
           * это единственный способ завести папку с клавиатуры.
           */
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        // Уход мышью сохраняет: человек напечатал имя и нажал в список —
        // это согласие, а не отказ. Пустое поле закрывается молча.
        onBlur={() => {
          if (name.trim() && name.trim() !== initial) submit();
          else cancel();
        }}
        aria-label="Название папки"
        placeholder="Название папки"
        className={
          'w-full rounded-lg bg-[var(--surface-sunken)] px-2 py-1.5 text-[13px] outline-none ring-1 ' +
          (error ? 'ring-[var(--danger)]' : 'ring-[var(--accent)]')
        }
      />
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </form>
  );
}


function Row({ item }: { item: Item }) {
  return (
    <li>
      <Link
        to={item.to}
        aria-current={item.active ? 'page' : undefined}
        className={columnRowClass({ active: item.active, nested: item.nested })}
      >
        <item.icon size={item.nested ? 14 : 16} strokeWidth={1.75} className="shrink-0" />
        <span className="md:flex-1 md:truncate">{item.label}</span>
        {item.count ? (
          <span className="tabular text-xs text-[var(--text-muted)]">{item.count}</span>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * Корень дерева — «Мои документы».
 *
 * Нажатие на саму строку делает два дела сразу: открывает весь список
 * и складывает папки. Так ведёт себя папка верхнего уровня в проводнике,
 * и другого способа «свернуть всё» человек искать не станет.
 *
 * Уголок — отдельная кнопка рядом со ссылкой, а не внутри неё: кнопка
 * внутри ссылки — недопустимая разметка, и нажатие на неё всё равно
 * уводило бы по ссылке.
 */
function RootRow({
  active,
  expanded,
  onCollapse,
  onToggle,
  onMenu,
}: {
  active: boolean;
  expanded: boolean;
  onCollapse: () => void;
  onToggle: () => void;
  onMenu: (e: MouseEvent<HTMLElement>) => void;
}) {
  return (
    /* Подсветка живёт на ссылке, а не на строке: иначе она затекает под
       уголок, и наведение на список выглядит как наведение на кнопку. */
    <li className="group flex items-center" onContextMenu={onMenu}>
      <Link
        to="/documents"
        onClick={onCollapse}
        aria-current={active ? 'page' : undefined}
        className={columnRowClass({ active })}
      >
        <FolderOpen size={16} strokeWidth={1.75} className="shrink-0" />
        <span className="md:flex-1 md:truncate">Мои документы</span>
      </Link>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? 'Свернуть папки' : 'Показать папки'}
        className="shrink-0 px-2 py-2 text-[var(--text-muted)] hover:text-[var(--text)] max-md:hidden"
      >
        <ChevronDown
          size={15}
          strokeWidth={1.75}
          className={`transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>
    </li>
  );
}

/**
 * Рама библиотеки — общая `SectionLayout` с колонкой папок.
 *
 * «Создать» — одна кнопка: в колонке на широком экране, в панели — только
 * на телефоне, где колонки нет.
 */
export function LibraryLayout({
  archiveCount,
  head,
  tools,
  bar,
  children,
}: {
  archiveCount?: number | null;
  head: ReactNode;
  tools?: ReactNode;
  bar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SectionLayout
      columnTitle="Документы"
      column={
        <>
          <div className="hidden md:block">
            <CreateLink label="Создать документ" className="w-full" />
          </div>
          <LibraryNav archiveCount={archiveCount} />
        </>
      }
      head={head}
      tools={
        <>
          {tools}
          <CreateLink label="Создать" className="md:hidden" />
        </>
      }
      bar={bar}
    >
      {children}
    </SectionLayout>
  );
}

