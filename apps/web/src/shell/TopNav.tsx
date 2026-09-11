import { Link, useLocation } from 'react-router-dom';
import { cn } from '../ui/cn';
import { NAV_ITEMS, activeNav } from './nav';

/**
 * Верхняя полоса: пять пунктов, каждый — просто ссылка на свой раздел.
 *
 * Выпадающих здесь нет намеренно. Они повторяли то, что и так стоит
 * внутри раздела: у документов слева папки, у писем — состояния писем,
 * у интеграций — площадки. Человек нажимал стрелку, выбирал строку
 * и попадал ровно туда, куда попал бы одним нажатием на название,
 * а дальше всё равно ходил по колонке внутри раздела. Лишний шаг убран:
 * нажал — пришёл, дальше двигаешься на месте.
 */
export function TopNav() {
  const { pathname } = useLocation();
  const active = activeNav(pathname);

  return (
    <nav aria-label="Разделы" className="flex items-center gap-0.5">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          aria-current={active === item.key ? 'page' : undefined}
          className={cn(
            'inline-flex h-10 items-center rounded-lg px-3.5 text-base transition-colors',
            active === item.key
              ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
              : 'text-[var(--text)] hover:bg-[var(--surface-sunken)]',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
