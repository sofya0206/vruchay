import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
export type Placement = 'top' | 'bottom' | 'left' | 'right';

export interface CoachText {
  title: string;
  text: string;
  placement: Placement;
}

const CARD_W = 280;
const GAP = 14;
const MARGIN = 12;
const WAIT_MS = 5000;

interface Rect { top: number; left: number; width: number; height: number }

/**
 * Карточка у элемента: заголовок, одна строка, стрелки.
 *
 * Экран чуть притемнён, элемент вырезан и обведён; нажатие по нему ведёт
 * дальше, как и стрелка. Крестик и Esc закрывают. Фокус не отбирает.
 */
export function Coach({
  hint,
  anchor,
  step,
  onNext,
  onBack,
  onClose,
  onMissing,
}: {
  hint: CoachText;
  /** Где элемент: ищется каждый кадр — панели открываются, окно меняется. */
  anchor: () => Element | null;
  step?: { index: number; total: number };
  onNext: () => void;
  onBack?: () => void;
  onClose: () => void;
  onMissing: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: CARD_W, h: 120 });
  const titleId = useId();
  // Искалка меняется на каждой отрисовке хозяина, а место — нет.
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const missingRef = useRef(onMissing);
  missingRef.current = onMissing;

  // Следим за элементом каждый кадр: панели открываются, окно меняется.
  useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const tick = () => {
      const r = anchorRef.current()?.getBoundingClientRect();
      if (r && (r.width > 0 || r.height > 0)) {
        setRect((p) =>
          p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height
            ? p
            : { top: r.top, left: r.left, width: r.width, height: r.height },
        );
      } else if (performance.now() - started > WAIT_MS) {
        missingRef.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hint]);

  useLayoutEffect(() => {
    if (!card.current) return;
    const { width, height } = card.current.getBoundingClientRect();
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  if (!rect) return null;
  const pos = place(rect, size, hint.placement);
  const last = !step || step.index === step.total - 1;

  return createPortal(
    <>
      {/* Вырез: тень на весь экран вокруг элемента, сам элемент кликабелен. */}
      <div
        aria-hidden
        onClick={step ? onNext : undefined}
        className="vru-coach-spot fixed z-[70] rounded-xl"
        style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, pointerEvents: step ? 'auto' : 'none' }}
      />
      <div
        ref={card}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        className="vru-coach-card fixed z-[71] rounded-2xl bg-[var(--surface-raised)] px-4 pb-3 pt-3.5 shadow-lg ring-1 ring-[var(--line)]"
        style={{ top: pos.top, left: pos.left, width: CARD_W }}
      >
        <IconButton size="sm" label="Закрыть" onClick={onClose} className="absolute right-1.5 top-1.5">
          <X size={15} />
        </IconButton>
        <h2 id={titleId} className="pr-7 text-[15px] font-medium text-balance">
          {hint.title}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{hint.text}</p>
        <div className="mt-3 flex items-center gap-1.5">
          {step && (
            <span className="mr-auto text-xs tabular-nums text-[var(--text-muted)]">
              {step.index + 1} из {step.total}
            </span>
          )}
          {onBack && (
            <IconButton size="sm" label="Назад" onClick={onBack}>
              <ArrowLeft size={16} />
            </IconButton>
          )}
          <Button
            size="sm"
            variant="primary"
            className={step ? 'size-8 px-0' : 'ml-auto size-8 px-0'}
            onClick={onNext}
            aria-label={last ? 'Готово' : 'Дальше'}
            title={last ? 'Готово' : 'Дальше'}
            icon={last ? <Check size={16} /> : <ArrowRight size={16} />}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}

export function place(
  r: Rect,
  size: { w: number; h: number },
  preferred: Placement,
  viewport = { w: window.innerWidth, h: window.innerHeight },
): { top: number; left: number } {
  const fits: Record<Placement, boolean> = {
    top: r.top - GAP - size.h >= MARGIN,
    bottom: r.top + r.height + GAP + size.h <= viewport.h - MARGIN,
    left: r.left - GAP - size.w >= MARGIN,
    right: r.left + r.width + GAP + size.w <= viewport.w - MARGIN,
  };
  const opposite: Record<Placement, Placement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const side = [preferred, opposite[preferred], 'bottom', 'top', 'left', 'right'].find((p) => fits[p as Placement]) as Placement | undefined ?? 'bottom';
  let top: number, left: number;
  if (side === 'top' || side === 'bottom') {
    top = side === 'top' ? r.top - GAP - size.h : r.top + r.height + GAP;
    left = r.left + r.width / 2 - size.w / 2;
  } else {
    left = side === 'left' ? r.left - GAP - size.w : r.left + r.width + GAP;
    top = r.top;
  }
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));
  return { top: clamp(top, MARGIN, viewport.h - size.h - MARGIN), left: clamp(left, MARGIN, viewport.w - size.w - MARGIN) };
}
