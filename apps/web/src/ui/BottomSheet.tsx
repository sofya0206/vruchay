import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { useKeyboardInset } from './useMediaQuery';

/** Сколько длится выезд и уход листа. Уход короче: закрытие не должно тянуть. */
const ENTER_MS = 280;
const EXIT_MS = 180;
/** Порог смахивания вниз: дальше этого или быстрее этого — закрываем. */
const DISMISS_PX = 100;
const DISMISS_SPEED = 0.5; // px/мс

/**
 * Нижний лист — вместо выпадающего списка и окна посреди экрана на телефоне.
 *
 * До верхнего края телефона большим пальцем не дотянуться, а выпадашка
 * у верхней панели открывалась как раз там. Лист выезжает снизу, где палец
 * уже лежит, и закрывается так же, как в системных приложениях: смахнуть
 * вниз за ручку, нажать мимо или «Закрыть».
 *
 * Сделан на `<dialog>` с `showModal()`: фокус внутрь, Esc и недоступный
 * фон браузер даёт сам, без своей ловушки фокуса. Затемнение и сам лист
 * рисуем внутри диалога, а не через `::backdrop` — у псевдоэлемента нет
 * анимации появления в Safari до 17.5.
 *
 * Над экранной клавиатурой лист поднимается сам: на iOS она ложится
 * поверх страницы, и поле ввода внизу листа иначе ушло бы под неё.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Заголовок листа; он же доступное имя диалога. */
  title: string;
  children: ReactNode;
  /** Нижняя строка с действиями — остаётся на месте при прокрутке содержимого. */
  footer?: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Лист живёт в разметке чуть дольше, чем открыт: иначе уходить ему некуда.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<{ y: number; t: number } | null>(null);
  const keyboard = useKeyboardInset();

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const el = dialog.current;
    if (!mounted || !el) return;
    // Совсем старые браузеры без `showModal` показывают диалог просто
    // открытым: слой всё равно приклеен к экрану нашими классами.
    if (!el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    // Выезд — со следующего кадра, чтобы браузер успел увидеть начальное
    // положение за краем экрана.
    const frame = requestAnimationFrame(() => setShown(true));
    // Страницу под листом не прокручиваем: на iOS она едет вслед за пальцем.
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(frame);
      root.style.overflow = before;
      if (el.open) el.close();
    };
  }, [mounted]);

  if (!mounted) return null;

  const onHandleDown = (e: React.PointerEvent) => {
    dragStart.current = { y: e.clientY, t: performance.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dy = e.clientY - dragStart.current.y;
    // Вверх лист не тянется, а слегка упирается — как системный.
    setDrag(dy > 0 ? dy : dy * 0.15);
  };
  const onHandleUp = (e: React.PointerEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const dy = e.clientY - start.y;
    const speed = dy / Math.max(1, performance.now() - start.t);
    setDrag(0);
    if (dy > DISMISS_PX || speed > DISMISS_SPEED) onClose();
  };

  const dragging = dragStart.current !== null;

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      // Esc: закрываем своим путём, чтобы уход был с анимацией.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-[var(--text)] backdrop:bg-transparent"
      style={{ overscrollBehavior: 'contain' }}
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-[var(--scrim)] transition-opacity"
        style={{
          opacity: shown ? 1 : 0,
          transitionDuration: `${shown ? ENTER_MS : EXIT_MS}ms`,
          touchAction: 'none',
        }}
      />
      <div
        ref={panel}
        className={cn(
          'sheet-max-h absolute inset-x-0 flex flex-col rounded-t-2xl bg-[var(--surface)] shadow-lg ring-1 ring-[var(--line)]',
          className,
        )}
        style={{
          bottom: keyboard,
          transform: `translateY(${shown ? drag : '100%'}${shown ? 'px' : ''})`,
          transition: dragging
            ? 'none'
            : `transform ${shown ? ENTER_MS : EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
          // Полоса «домой» на айфонах без кнопки — поверх неё не кладём.
          paddingBottom: keyboard ? 0 : 'env(safe-area-inset-bottom)',
        }}
      >
        <div
          className="shrink-0 cursor-grab touch-none select-none"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--line-strong)]" />
          <header className="flex items-center gap-2 py-1 pr-2 pl-5">
            <h2 className="min-w-0 flex-1 truncate text-base font-medium">{title}</h2>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="grid size-11 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]"
            >
              <X size={20} />
            </button>
          </header>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">{children}</div>
        {footer && (
          <footer className="flex shrink-0 gap-2 border-t border-[var(--line)] px-4 py-3">{footer}</footer>
        )}
      </div>
    </dialog>
  );
}
