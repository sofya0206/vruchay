import { useId } from 'react';

/**
 * Знак «Вручай»: печать с галочкой на сине-фиолетовом градиенте.
 *
 * Один рисунок на шапку, вход, посадочную и иконку приложения
 * (`public/icon.svg`, заставка в `index.html` — тот же контур). Печать —
 * потому что сервис не рисует грамоты, а удостоверяет: документ выдан,
 * и это можно проверить.
 */
export function Brand({ size = 44, className = '' }: { size?: number; className?: string }) {
  const id = useId();
  const gradient = `brand-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      style={{ borderRadius: size * 0.27 }}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f77ff" />
          <stop offset="1" stopColor="#6d5df6" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" fill={`url(#${gradient})`} />
      <circle cx="12" cy="12" r="6.6" fill="none" stroke="#ffffff" strokeWidth="1.9" />
      <path
        d="M8.7 12.3l2.2 2.2 4.6-4.9"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
