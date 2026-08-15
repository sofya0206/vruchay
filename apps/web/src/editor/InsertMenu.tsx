import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Image as ImageIcon, Link2, Plus, QrCode, Type } from 'lucide-react';
import { SYSTEM_VARIABLES } from '@gramota/shared';

/**
 * Меню «Вставить» вместо отдельной кнопки на каждый тип блока.
 *
 * Кнопка «Текст» рядом с кнопкой «Фон» читалась как выбор из двух, хотя
 * на лист можно положить ещё QR-код и ссылку. Собранные в одном месте,
 * они видны все сразу — и это ровно та связка, которую человек знает
 * по любому текстовому редактору.
 */
export function InsertMenu({
  onInsert,
  variables = [],
  onBackground,
  backgroundLoading = false,
  hasBackground = false,
}: {
  onInsert: (
    type: 'text' | 'qr' | 'link',
    size: { w: number; h: number },
    text?: string,
  ) => void;
  /** Колонки таблицы получателей — из них складываются переменные. */
  variables?: string[];
  /** Выбор файла бланка. Открывается системным окном, поэтому не onInsert. */
  onBackground: () => void;
  /** Загружается ли бланк прямо сейчас. */
  backgroundLoading?: boolean;
  /** Есть ли уже бланк: от этого зависит подсказка первого шага. */
  hasBackground?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        setOpen(false);
        setSubmenu(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Первый Escape закрывает подменю, второй — всё меню: иначе один
      // промах по клавише выбрасывал бы из обоих уровней сразу.
      if (submenu) setSubmenu(false);
      else setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open, submenu]);

  const items = [
    {
      type: 'text' as const,
      icon: <Type size={15} />,
      label: 'Текст',
      hint: 'Имя, звание, дата — с подстановкой из таблицы',
      size: { w: 120, h: 20 },
    },
    {
      type: 'qr' as const,
      icon: <QrCode size={15} />,
      label: 'QR-код',
      hint: 'Ссылка на проверку подлинности документа',
      size: { w: 30, h: 30 },
    },
    {
      type: 'link' as const,
      icon: <Link2 size={15} />,
      label: 'Ссылка',
      hint: 'Кликабельный адрес в PDF',
      size: { w: 80, h: 10 },
    },
  ];

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-sm text-white transition-opacity hover:opacity-90"
      >
        <Plus size={15} />
        Вставить
        <ChevronDown size={14} />
      </button>

      {open && (
        <div
          role="menu"
          // Без overflow-hidden: подменю выезжает вправо за границу меню,
          // и обрезка съедала бы его целиком. Скругление углов сохраняем
          // через rounded-xl у самих пунктов — оно и так видно только с краёв.
          className="absolute left-0 top-10 z-20 w-72 rounded-xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
        >
          {/* Бланк первым: это первый шаг работы. Человек открывает пустой
              редактор и должен видеть, с чего начинать, а не гадать между
              «Текстом» и «Фоном» как между равными. */}
          <button
            type="button"
            role="menuitem"
            disabled={backgroundLoading}
            onClick={() => {
              setOpen(false);
              onBackground();
            }}
            className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            <span className="mt-0.5 text-[var(--text-muted)]">
              <ImageIcon size={15} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">
                {backgroundLoading ? 'Загружаем бланк…' : hasBackground ? 'Заменить бланк' : 'Бланк'}
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                {hasBackground
                  ? 'Другая картинка вместо нынешней'
                  : 'С этого начинают: картинка вашей грамоты'}
              </span>
            </span>
          </button>

          <div className="my-1 border-t border-[var(--line)]" />

          {items.map((it) => {
            // У текста третий уровень: сразу вставить блок с нужной
            // переменной. Человек, размечающий грамоту, думает не «положу
            // текст, потом впишу %name», а «сюда пойдёт имя».
            // Служебные переменные есть всегда — даже когда таблица пуста,
            // подменю открывать есть ради чего.
            const hasSub = it.type === 'text';

            return (
              <div key={it.type} className="relative">
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup={hasSub ? 'menu' : undefined}
                  aria-expanded={hasSub ? submenu : undefined}
                  onClick={() => {
                    if (hasSub) {
                      setSubmenu((v) => !v);
                      return;
                    }
                    setOpen(false);
                    onInsert(it.type, it.size);
                  }}
                  onMouseEnter={() => hasSub && setSubmenu(true)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-sunken)]"
                >
                  <span className="mt-0.5 text-[var(--text-muted)]">{it.icon}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{it.label}</span>
                    <span className="block text-xs text-[var(--text-muted)]">{it.hint}</span>
                  </span>
                  {hasSub && <ChevronRight size={14} className="mt-1 text-[var(--text-muted)]" />}
                </button>

                {hasSub && submenu && (
                  <div
                    role="menu"
                    className="absolute left-full top-0 z-30 ml-1 w-64 overflow-hidden rounded-xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-[var(--line)]"
                  >
                    {variables.length > 0 && (
                      <>
                        <p className="px-3 py-1.5 text-xs text-[var(--text-muted)]">
                          Подставится из таблицы получателей
                        </p>
                        {variables.map((name) => (
                          <button
                            key={name}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpen(false);
                              setSubmenu(false);
                              onInsert('text', it.size, `%${name}`);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-sunken)]"
                          >
                            <code className="font-mono text-xs text-[var(--accent)]">%{name}</code>
                            <span className="text-sm text-[var(--text-muted)]">
                              {describe(name)}
                            </span>
                          </button>
                        ))}
                        <div className="my-1 border-t border-[var(--line)]" />
                      </>
                    )}

                    {/* Подставляет сервис — руками их в таблицу не внести.
                        Показываем отдельным разделом, чтобы не путались
                        с колонками, которые организация завела сама. */}
                    <p className="px-3 py-1.5 text-xs text-[var(--text-muted)]">
                      Подставит сервис
                    </p>
                    {SYSTEM_VARIABLES.map((v) => (
                      <button
                        key={v.name}
                        type="button"
                        role="menuitem"
                        title={v.hint}
                        onClick={() => {
                          setOpen(false);
                          setSubmenu(false);
                          onInsert('text', it.size, `%${v.name}`);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-sunken)]"
                      >
                        <code className="font-mono text-xs text-[var(--accent)]">%{v.name}</code>
                        <span className="text-sm text-[var(--text-muted)]">{v.title}</span>
                      </button>
                    ))}
                    <div className="my-1 border-t border-[var(--line)]" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        setSubmenu(false);
                        onInsert('text', it.size);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-sunken)]"
                    >
                      Просто текст, без подстановки
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Понятное название переменной.
 *
 * Колонки заводит сам пользователь, и большинство имён говорят за себя.
 * Поясняем только те, что заведены сервисом по умолчанию, — иначе
 * пришлось бы придумывать описания чужим словам и врать.
 */
function describe(name: string): string {
  const known: Record<string, string> = {
    name: 'фамилия и имя',
    email: 'адрес почты',
  };
  return known[name] ?? '';
}
