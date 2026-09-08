import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Строка меню документа — «Файл», «Правка», «Вставка», «Данные», «Справка».
 *
 * Меню, а не россыпь кнопок в шапке: действий над материалом полтора десятка,
 * и вынесенные на панель они превращались в ленту одинаковых значков, где
 * «Переименовать» неотличимо от «Переместить». В меню у каждого действия есть
 * слово, а панель остаётся короткой — на ней только то, чем пользуются
 * каждую минуту.
 *
 * Само меню ничего не знает про документ: оно получает готовые пункты
 * и рисует их. Поэтому одна и та же строка стоит и над листом, и над
 * таблицей, а различаются только наборы пунктов.
 */

/** Пункт меню либо разделитель между смысловыми группами. */
export type MenuEntry =
  | { separator: true }
  | {
      separator?: false;
      icon?: ReactNode;
      label: string;
      /** Горячая клавиша — справа серым, как в любом настольном меню. */
      shortcut?: string;
      onSelect: () => void;
      disabled?: boolean;
      /** Опасное действие — красным. Такое в меню всегда последнее. */
      danger?: boolean;
    };

export interface MenuDef {
  id: string;
  label: string;
  entries: MenuEntry[];
}

export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative flex items-center gap-0.5" role="menubar">
      {menus.map((menu) => (
        <div key={menu.id} className="relative">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === menu.id}
            onClick={() => setOpen((v) => (v === menu.id ? null : menu.id))}
            /* Когда одно меню открыто, соседние раскрываются наведением —
               так ведут себя все меню, к которым человек привык. */
            onMouseEnter={() => open && setOpen(menu.id)}
            className={`rounded-md px-2 py-0.5 text-sm transition-colors ${
              open === menu.id
                ? 'bg-[var(--surface-sunken)] text-[var(--text)] ring-1 ring-[var(--line)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]'
            }`}
          >
            {menu.label}
          </button>

          {open === menu.id && (
            <div
              role="menu"
              aria-label={menu.label}
              className="absolute left-0 top-full z-30 mt-1 min-w-[248px] rounded-xl bg-[var(--surface)] py-1.5 shadow-lg ring-1 ring-[var(--line)]"
            >
              {menu.entries.map((entry, i) =>
                entry.separator ? (
                  <div key={i} className="my-1.5 border-t border-[var(--line)]" />
                ) : (
                  <button
                    key={i}
                    type="button"
                    role="menuitem"
                    disabled={entry.disabled}
                    onClick={() => {
                      setOpen(null);
                      entry.onSelect();
                    }}
                    className={`flex w-full items-center gap-3.5 px-3.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      entry.danger
                        ? 'text-[var(--danger)] hover:bg-[var(--danger-soft)]'
                        : 'text-[var(--text)] hover:bg-[var(--surface-sunken)]'
                    }`}
                  >
                    <span
                      className={`grid w-4 shrink-0 place-items-center ${
                        entry.danger ? '' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {entry.icon}
                    </span>
                    <span className="flex-1 whitespace-nowrap">{entry.label}</span>
                    {entry.shortcut && (
                      <span className="shrink-0 text-xs text-[var(--text-muted)]">
                        {entry.shortcut}
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
