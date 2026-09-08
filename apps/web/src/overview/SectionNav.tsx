import { Link } from 'react-router-dom';
import { SECTION_GROUPS, type Section } from '../shell/sections';
import { GroupTitle } from './QuickActions';

/**
 * Разделы, которые открывают между делом: подключения, оплата, проверка.
 *
 * Строкой и без картинки — в отличие от «Моих документов» сверху: туда
 * заходят каждый день и там показывают, что внутри, а сюда заходят,
 * когда возник вопрос, и хватает названия со строкой объяснения.
 *
 * Ничего не сворачивается: спрятанный раздел человек не находит вовсе,
 * а разделов всего четыре — прятать нечего.
 */
export function SectionNav() {
  return (
    <div className="grid gap-8">
      {SECTION_GROUPS.map((group) => (
        <section key={group.id}>
          <GroupTitle>{group.title}</GroupTitle>
          {/* Плитки делят ширину группы поровну и тянутся, а не стоят
              в сетке фиксированных колонок: колонок было три при двух
              разделах, и справа от каждой группы оставалась дыра. */}
          <ul className="flex flex-wrap gap-4">
            {group.items.map((item) => (
              <Tile key={item.path} section={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Tile({ section }: { section: Section }) {
  return (
    <li className="min-w-64 flex-1">
      <Link
        to={section.path}
        className="flex h-full items-center gap-4 rounded-[var(--radius-card)] bg-[var(--surface)] p-4 shadow-[var(--ring-line)] transition-colors hover:bg-[var(--accent-soft)] hover:shadow-[inset_0_0_0_1px_var(--accent)]"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-soft)] text-[var(--accent)]">
          <section.icon size={20} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{section.label}</span>
          <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{section.about}</span>
        </span>
      </Link>
    </li>
  );
}
