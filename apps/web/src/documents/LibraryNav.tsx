import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Archive, FileText, FolderOpen, LayoutTemplate, User } from 'lucide-react';

/**
 * Колонка разделов библиотеки: документы и шаблоны.
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
  /** Сколько лежит внутри. Ноль не рисуем — пустое место честнее нуля. */
  count?: number | null;
  end?: boolean;
}

interface Group {
  title: string;
  icon: typeof FileText;
  items: Item[];
}

export function LibraryNav({ archiveCount }: { archiveCount?: number | null }) {
  const groups: Group[] = [
    {
      title: 'Документы',
      icon: FileText,
      items: [
        { to: '/documents', label: 'Рабочие', icon: FolderOpen, end: true },
        { to: '/documents/archive', label: 'Архив', icon: Archive, count: archiveCount },
      ],
    },
    {
      title: 'Шаблоны',
      icon: LayoutTemplate,
      items: [
        { to: '/templates', label: 'Шаблоны', icon: LayoutTemplate, end: true },
        { to: '/templates/my', label: 'Мои шаблоны', icon: User },
      ],
    },
  ];

  return (
    <nav aria-label="Разделы библиотеки" className="md:w-56 md:shrink-0">
      {/* На узком экране колонка превратилась бы в две трети экрана телефона,
          поэтому там это лента, которая прокручивается вбок. */}
      <div className="flex gap-6 overflow-x-auto md:flex-col md:overflow-visible">
        {groups.map((group) => (
          <div key={group.title} className="min-w-max">
            <p className="mb-1.5 flex items-center gap-2 text-sm font-medium text-[var(--text-muted)]">
              <group.icon size={15} strokeWidth={1.75} />
              {group.title}
            </p>
            <ul className="flex gap-1 md:flex-col">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-[var(--accent-soft)] font-medium text-[var(--text)]'
                          : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
                      }`
                    }
                  >
                    <item.icon size={15} strokeWidth={1.75} />
                    {item.label}
                    {item.count ? (
                      <span className="tabular-nums text-[var(--text-muted)]">{item.count}</span>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** Общая рамка раздела библиотеки: колонка слева, содержимое справа. */
export function LibraryLayout({
  archiveCount,
  children,
}: {
  archiveCount?: number | null;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-col gap-8 md:flex-row">
        <LibraryNav archiveCount={archiveCount} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
