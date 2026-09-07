import type { ReactNode } from 'react';
import { Info, Link2, Send, Sheet } from 'lucide-react';

/**
 * Значки интеграций.
 *
 * У каждой площадки свой цвет — по нему пункт меню узнаётся быстрее, чем
 * по названию. Значок квадратный со скруглением, как логотипы сервисов,
 * а не круглый: круг мы бережём под аватар человека.
 */
function Tile({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md"
      style={{ backgroundColor: tone }}
      aria-hidden
    >
      {children}
    </span>
  );
}

export const InfoGlyph = (
  <Tile tone="var(--surface-sunken)">
    <Info size={14} className="text-[var(--text-muted)]" />
  </Tile>
);

/** У Тильды нет узнаваемого символа в наборе значков — берём букву. */
export const TildaGlyph = (
  <Tile tone="#eaf3fe">
    <span className="font-serif text-xs leading-none text-[var(--accent)]">T</span>
  </Tile>
);

export const SheetsGlyph = (
  <Tile tone="#e6f4ea">
    <Sheet size={14} className="text-[#188038]" />
  </Tile>
);

export const TelegramGlyph = (
  <Tile tone="#e3f2fd">
    <Send size={14} className="text-[#229ed9]" />
  </Tile>
);

export const LinkGlyph = (
  <Tile tone="var(--accent-soft)">
    <Link2 size={14} className="text-[var(--accent)]" />
  </Tile>
);
