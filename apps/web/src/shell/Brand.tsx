/**
 * Знак «Вручай»: буква «В», нарисованная кривыми, на сплошном фоне.
 *
 * Один рисунок на шапку, вход, посадочную и иконку приложения
 * (`public/icon.svg`, заставка в `index.html` — тот же контур). Буква,
 * а не системный шрифт — иначе на 16 px вкладки браузера контур смазывается
 * в зависимости от того, чем браузер её отрисовал.
 */
export function Brand({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      style={{ borderRadius: size * 0.27 }}
    >
      <rect width="24" height="24" fill="#4A3FCE" />
      <path d="M7.5,6.19 H13.5 A2.77,2.77 0 0 1 13.5,11.72 H7.5 Z" fill="#fff" />
      <path d="M7.5,11.72 H13.69 A2.95,2.95 0 0 1 13.69,17.63 H7.5 Z" fill="#fff" />
    </svg>
  );
}
