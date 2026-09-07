import { Link } from 'react-router-dom';
import type { Overview } from '../api/overview';
import { SECTION_GROUPS, type Section } from '../shell/sections';

/**
 * Навигатор по кабинету — то, ради чего главная существует.
 *
 * Раньше разделы жили лентой в шапке: семь подписей, которые на телефоне
 * уезжали вбок, и ни одной цифры рядом. Здесь у каждого раздела есть строка
 * о том, что внутри, и живое число — сколько там лежит прямо сейчас.
 * По числу и выбирают, куда идти: пустой раздел открывать незачем.
 *
 * Ничего не сворачивается: спрятанный раздел человек не находит вовсе,
 * а разделов всего пять — прятать нечего.
 */
export function SectionNav({ data }: { data: Overview }) {
  const { usage } = data;
  const unlimited = usage.limit === null || usage.left === null;

  /** Цифра на плитке. Ноль не рисуем: пустое место честнее нуля. */
  const counts: Record<string, string | null> = {
    '/documents': data.materials > 0 ? String(data.materials) : null,
    '/registry': data.issuedTotal > 0 ? String(data.issuedTotal) : null,
    '/billing': unlimited ? '∞' : String(usage.left ?? 0),
  };

  return (
    <div className="space-y-8">
      {SECTION_GROUPS.map((group) => (
        <section key={group.id}>
          <h2 className="mb-3 text-sm font-medium tracking-wide text-[var(--text-muted)] uppercase">
            {group.title}
          </h2>
          {/* Плитки делят ширину группы поровну и тянутся, а не стоят
              в сетке фиксированных колонок: колонок было три при двух
              разделах, и справа от каждой группы оставалась дыра. */}
          <ul className="flex flex-wrap gap-4">
            {group.items.map((item) => (
              <Tile key={item.path} section={item} count={counts[item.path] ?? null} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Tile({ section, count }: { section: Section; count: string | null }) {
  return (
    <li className="min-w-64 flex-1">
      <Link
        to={section.path}
        className="flex h-full items-center gap-4 rounded-2xl bg-[var(--surface)] p-5 ring-1 ring-[var(--line)] transition-colors hover:bg-[var(--accent-soft)] hover:ring-[var(--accent)]"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <section.icon size={20} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{section.label}</span>
            {count && <span className="shrink-0 text-xl font-semibold tabular-nums">{count}</span>}
          </span>
          <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{section.about}</span>
        </span>
      </Link>
    </li>
  );
}
