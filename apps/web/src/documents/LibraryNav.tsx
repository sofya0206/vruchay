import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  LayoutTemplate,
  Plus,
  User,
} from 'lucide-react';
import { DOCUMENT_CATEGORIES } from '@gramota/shared';

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
 * заново выпускают через год, когда соревнование повторяется.
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
  /** Папка раздела — вложена в «Рабочие» и подписана мельче. */
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
        'inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 ' +
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
 * Разделы материалов — папками в колонке, а не лентой кнопок над списком.
 *
 * Лента съедала строку над каждым списком и всё равно читалась как фильтр,
 * который кто-то забыл выключить. В колонке те же разделы стоят там, где
 * человек ищет папки, и у каждой свой адрес: на «Спортивные соревнования»
 * можно дать ссылку, а «Назад» возвращает ко всем рабочим.
 *
 * Материал кладут в папку при создании или через меню карточки; лежащие
 * вне папок видны в «Рабочих» — там весь список целиком.
 *
 * «Рабочие» — корень дерева: нажатие на них открывает весь список и
 * складывает папки, как в любом проводнике. Раскрыть обратно — уголком
 * справа от строки; он же показывает, сложено дерево или нет.
 */
export function LibraryNav({ archiveCount }: { archiveCount?: number | null }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const category = params.get('category');
  const onDocuments = pathname === '/documents';
  const [expanded, setExpanded] = useState(true);

  /*
   * Открытая папка обязана быть видна, даже если дерево было сложено:
   * по ссылке из письма, по «Назад» в браузере или по Esc человек попадает
   * в папку, и подсвечивать нечего, когда строки нет на экране.
   */
  useEffect(() => {
    if (category) setExpanded(true);
  }, [category]);

  const folders: Item[] = DOCUMENT_CATEGORIES.map((c) => ({
    to: `/documents?category=${c.id}`,
    label: c.title,
    icon: Folder,
    active: onDocuments && category === c.id,
    nested: true,
  }));

  const archive: Item[] = [
    {
      to: '/documents/archive',
      label: 'Архив',
      icon: Archive,
      active: pathname === '/documents/archive',
      count: archiveCount,
    },
  ];

  const templates: Item[] = [
    {
      to: '/templates',
      label: 'Шаблоны',
      icon: LayoutTemplate,
      active: pathname === '/templates',
    },
    { to: '/templates/my', label: 'Мои шаблоны', icon: User, active: pathname === '/templates/my' },
  ];

  return (
    <nav aria-label="Разделы библиотеки" className="mt-3">
      {/* На узком экране колонка превратилась бы в две трети экрана телефона,
          поэтому там это лента, которая прокручивается вбок. */}
      <div className="flex gap-1 overflow-x-auto md:block md:overflow-visible">
        <ul className="flex gap-1 md:flex-col">
          <RootRow
            active={onDocuments && !category}
            expanded={expanded}
            onCollapse={() => setExpanded(false)}
            onToggle={() => setExpanded((v) => !v)}
          />
          {expanded && folders.map((item) => <Row key={item.to} item={item} />)}
          {archive.map((item) => (
            <Row key={item.to} item={item} />
          ))}
        </ul>
        {/* Волосяная линия вместо подписи группы: материалы и бланки —
            разные списки, но подписывать их отдельно значит занять две
            строки колонки ради двух слов. */}
        <List items={templates} className="md:mt-2 md:border-t md:border-[var(--line)] md:pt-2" />
      </div>
    </nav>
  );
}

function List({ items, className = '' }: { items: Item[]; className?: string }) {
  return (
    <ul className={`flex gap-1 md:flex-col ${className}`}>
      {items.map((item) => (
        <Row key={item.to} item={item} />
      ))}
    </ul>
  );
}

/** Общий вид строки колонки: значок, подпись, число внутри. */
function rowClass(active: boolean, nested = false): string {
  return (
    'flex items-center gap-2.5 rounded-lg border-l-2 py-2 text-sm whitespace-nowrap ' +
    'transition-colors ' +
    // Вложенные папки: отступ слева и мельче кегль — иначе колонка
    // читается как один плоский список из восьми равноправных строк.
    (nested ? 'px-3 md:pl-8 md:text-[13px] ' : 'px-3 ') +
    (active
      ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
      : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]')
  );
}

function Row({ item }: { item: Item }) {
  return (
    <li>
      <Link
        to={item.to}
        aria-current={item.active ? 'page' : undefined}
        className={rowClass(item.active, item.nested)}
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
 * Корень дерева — «Рабочие».
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
}: {
  active: boolean;
  expanded: boolean;
  onCollapse: () => void;
  onToggle: () => void;
}) {
  return (
    <li className={`${rowClass(active)} gap-0 px-0`}>
      <Link
        to="/documents"
        onClick={onCollapse}
        aria-current={active ? 'page' : undefined}
        className="flex flex-1 items-center gap-2.5 px-3 py-2"
      >
        <FolderOpen size={16} strokeWidth={1.75} className="shrink-0" />
        <span className="md:flex-1 md:truncate">Рабочие</span>
      </Link>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? 'Свернуть папки разделов' : 'Показать папки разделов'}
        className="px-2 py-2 text-[var(--text-muted)] hover:text-[var(--text)]"
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
 * Общая рамка раздела библиотеки.
 *
 * `head` — левая часть верхней панели (название списка), `tools` — то,
 * что стоит перед кнопкой создания (поиск), `bar` — нижняя строка
 * состояния. Кнопку создания рамка рисует сама: она обязана стоять
 * на одном месте во всех списках раздела.
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
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="border-b border-[var(--line)] md:w-60 md:shrink-0 md:border-r md:border-b-0">
        {/* 65px — высота шапки кабинета (кнопка 40px и отступы 2×12) плюс
            её линия. Колонка встаёт ровно под шапку и дальше стоит на месте,
            пока список прокручивается. */}
        <div className="p-3 md:sticky md:top-[65px] md:max-h-[calc(100vh-65px)] md:overflow-y-auto">
          {/* На телефоне колонка стоит над панелью, и две кнопки «Создать»
              оказались бы подряд одна под другой — здесь остаётся та,
              что в панели. */}
          <div className="hidden md:block">
            <CreateLink label="Создать" className="w-full" />
          </div>
          <LibraryNav archiveCount={archiveCount} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="z-10 flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-6 py-3 md:sticky md:top-[65px]">
          <div className="min-w-0 flex-1">{head}</div>
          {tools}
          <CreateLink label="Создать документ" />
        </div>

        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>

        {bar && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-[var(--surface)] px-6 py-2.5 text-sm">
            {bar}
          </div>
        )}
      </div>
    </div>
  );
}
