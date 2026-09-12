import { Link } from 'react-router-dom';

/**
 * Документация — подвалом главной, надписями, без плиток и иконок.
 *
 * Сюда ходят редко и по делу: прочитать про API, свериться с офертой,
 * написать в поддержку. Плитка такого же размера, как у разделов,
 * говорила бы, что документацию открывают так же часто, — это неправда,
 * и она отняла бы место у того, ради чего сюда заходят каждый день.
 *
 * Прижат к низу окна, а не приклеен к последнему блоку, — иначе
 * на коротком экране он висел бы посреди пустоты.
 */
const LINKS: { to: string; label: string; external?: boolean }[] = [
  { to: '/docs', label: 'База знаний' },
  { to: '/docs/README', label: 'Документация API' },
  { to: '/settings/support', label: 'Поддержка' },
  { to: '/oferta', label: 'Оферта' },
  { to: '/dpa', label: 'Обработка данных' },
  { to: '/privacy', label: 'Политика' },
];

export function DocsLinks() {
  return (
    <footer className="mt-auto px-6 py-4">
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {LINKS.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              className="text-sm text-[var(--text-muted)] underline-offset-4 transition-colors hover:text-[var(--text)] hover:underline"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </footer>
  );
}
