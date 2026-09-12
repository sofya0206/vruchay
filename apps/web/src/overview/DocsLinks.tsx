import { Link } from 'react-router-dom';

/**
 * Документация — подвалом главной, надписями, без плиток и иконок.
 *
 * Сюда ходят редко и по делу: прочитать про API, свериться с офертой,
 * написать в поддержку. Плитка такого же размера, как у разделов,
 * говорила бы, что документацию открывают так же часто, — это неправда,
 * и она отняла бы место у того, ради чего сюда заходят каждый день.
 *
 * Собран как шапка, только снизу: та же подложка, та же линия и та же
 * ширина во всё окно. Прижат к низу окна, а не приклеен к последнему
 * блоку, — иначе на коротком экране он висел бы посреди пустоты.
 */
const LINKS: { to: string; label: string; external?: boolean }[] = [
  /*
   * Оплата и аналитика — временно здесь.
   *
   * Плиток разделов на главной больше нет, а верхнее меню, куда эти два
   * раздела переезжают по решению владельца, делается соседней задачей.
   * Без этой строки в них нельзя попасть вовсе. Как только меню появится —
   * обе ссылки отсюда убрать, иначе раздел будет назван дважды.
   */
  { to: '/billing', label: 'Оплата' },
  { to: '/registry?tab=analytics', label: 'Аналитика' },
  { to: '/docs', label: 'База знаний' },
  { to: '/docs/README', label: 'Документация API' },
  { to: '/settings/support', label: 'Поддержка' },
  { to: '/oferta', label: 'Оферта' },
  { to: '/dpa', label: 'Обработка данных' },
  { to: '/privacy', label: 'Политика' },
];

export function DocsLinks() {
  return (
    <footer className="mt-auto px-3 py-4 sm:px-5">
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
