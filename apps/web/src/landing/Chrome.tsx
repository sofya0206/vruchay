import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import { Button } from '../ui/Button';

/**
 * Шапка и подвал публичных страниц.
 *
 * Один набор ссылок на все посадочные: главная, отраслевые страницы,
 * цены и юридические документы. Держать их в одном месте важнее, чем
 * кажется — подвал единственный способ дойти до страницы, на которую
 * не ведёт ни одна кнопка, а поисковик считает ссылки из подвала.
 */

/** Посадочные по покупателям. Пути должны совпадать с маршрутами в App.tsx. */
export const AUDIENCE_PAGES = [
  { to: '/gov', label: 'Госучреждениям' },
  { to: '/business', label: 'Организациям' },
  { to: '/personal', label: 'Физлицам и самозанятым' },
  { to: '/education', label: 'Образованию и онлайн-школам' },
  { to: '/international', label: 'Международный контур' },
];

const LEGAL_PAGES = [
  { to: '/privacy', label: 'Политика обработки данных' },
  { to: '/oferta', label: 'Лицензионный договор (оферта)' },
  { to: '/dpa', label: 'Договор-поручение' },
];

interface HeaderLink {
  href: string;
  label: string;
  /** Скрыть на узких экранах: в шапке помещаются две-три ссылки. */
  compact?: boolean;
}

export function SiteHeader({ links }: { links?: HeaderLink[] }) {
  const items = links ?? [
    { href: '/pricing', label: 'Цены' },
    { href: '/#kak', label: 'Как это работает', compact: true },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)]">
            <Award size={17} strokeWidth={1.75} />
          </span>
          <span className="font-serif text-lg">Вручай</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {items.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)] ${
                l.compact ? 'hidden sm:inline' : ''
              }`}
            >
              {l.label}
            </a>
          ))}
          <Link to="/login">
            <Button size="sm" variant="primary">
              Войти
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--line)]">
      <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-[var(--text-muted)]">
        <div className="grid gap-8 sm:grid-cols-[1fr_1fr_1fr]">
          <div>
            <span className="font-serif text-base text-[var(--text)]">Вручай</span>
            <p className="mt-2 leading-relaxed">
              Именные документы по списку: бланк ваш, имена и письма — наши. Данные участников
              хранятся в России.
            </p>
          </div>
          <div>
            <p className="font-medium text-[var(--text)]">Кому</p>
            <ul className="mt-2 space-y-1.5">
              {AUDIENCE_PAGES.map((p) => (
                <li key={p.to}>
                  <Link to={p.to} className="transition-colors hover:text-[var(--text)]">
                    {p.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/pricing" className="transition-colors hover:text-[var(--text)]">
                  Тарифы
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-[var(--text)]">Документы</p>
            <ul className="mt-2 space-y-1.5">
              {LEGAL_PAGES.map((p) => (
                <li key={p.to}>
                  <Link to={p.to} className="transition-colors hover:text-[var(--text)]">
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-8 border-t border-[var(--line)] pt-4">© 2026</p>
      </div>
    </footer>
  );
}
