import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import type { HintId } from '@gramota/shared';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { onboarding, useOnboarding } from './store';
import { track } from './track';

/** Одна строка на точку: заголовок и пояснение. */
const TEXT: Record<HintId, [string, string]> = {
  fields: ['Поле на листе — колонка в таблице', 'Перетащите поле из «Данных» на лист.'],
  import: ['Слева колонка файла, справа поле', 'Лишние колонки можно не привязывать.'],
};

/**
 * Карточка точки — рядом с ней, без затемнения. Галочка или крестик
 * гасят точку насовсем, Esc тоже.
 */
export function HintCard() {
  const { hint } = useOnboarding();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!hint) return setPos(null);
    const dot = document.querySelector(`[data-hint="${hint}"]`)?.getBoundingClientRect();
    if (!dot) {
      track({ flow: 'hint', step: hint, action: 'missing' });
      return onboarding.markSeen(hint);
    }
    const w = 280;
    const h = card.current?.offsetHeight ?? 110;
    const left = Math.min(Math.max(12, dot.left + dot.width / 2 - w / 2), window.innerWidth - w - 12);
    const below = dot.bottom + 10 + h < window.innerHeight;
    setPos({ top: below ? dot.bottom + 10 : dot.top - 10 - h, left });
    track({ flow: 'hint', step: hint, action: 'shown' });
  }, [hint]);

  useEffect(() => {
    if (!hint) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close('closed');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!hint) return null;
  const [title, text] = TEXT[hint];
  function close(action: 'done' | 'closed') {
    track({ flow: 'hint', step: hint!, action });
    onboarding.markSeen(hint!);
  }

  return createPortal(
    <div
      ref={card}
      role="dialog"
      aria-label={title}
      className="vru-coach-card fixed z-[90] w-[280px] rounded-2xl bg-[var(--surface-raised)] px-4 pb-3 pt-3.5 shadow-lg ring-1 ring-[var(--line)]"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      <IconButton size="sm" label="Закрыть" onClick={() => close('closed')} className="absolute right-1.5 top-1.5">
        <X size={15} />
      </IconButton>
      <h2 className="pr-7 text-[15px] font-medium text-balance">{title}</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{text}</p>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="primary" className="size-8 px-0" aria-label="Понятно" title="Понятно" icon={<Check size={16} />} onClick={() => close('done')} />
      </div>
    </div>,
    document.body,
  );
}
