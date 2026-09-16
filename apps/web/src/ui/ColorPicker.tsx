import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';
import { Popover } from './Popover';
import { useDismiss } from './useDismiss';
import { hexToHsv, hsvToHex, normalizeHex } from './color';

/**
 * Образцы под спектром.
 *
 * Это цвета дизайн-системы и нейтрали, а не «недавние»: документ верстают
 * раз в год, и список недавних к следующему разу устаревает. Фирменный
 * цвет организации всё равно приходит кодом из брендбука — для него поле
 * внизу.
 */
const SWATCHES = [
  '#091135',
  '#36394a',
  '#b1bbcd',
  '#e1e9f0',
  '#ffffff',
  '#127ee3',
  '#0f77ff',
  '#d92d3f',
  '#1f5d3f',
  '#8a6d2f',
];

/**
 * Выбор цвета.
 *
 * Системную пипетку заменяем целиком: она открывала диалог операционной
 * системы — с чужими шрифтами, чужими кнопками и без поля для кода,
 * а код из брендбука («#1F5D3F») мышью в радуге не подобрать.
 *
 * Наверх уходят только законченные значения. Промежуточное «#1F» иначе
 * превращало бы текст в чёрный на каждом нажатии, и допечатать код было
 * бы нельзя.
 */
export function ColorPicker({
  value,
  onChange,
  disabled,
  label = 'Цвет',
  compact,
  className,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  label?: string;
  /** Квадрат 32×32 без поля кода рядом — для панели оформления. */
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useDismiss(open, () => setOpen(false), trigger, panel);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'shrink-0 rounded-lg ring-1 ring-[var(--line-strong)] transition-shadow',
          'disabled:cursor-not-allowed disabled:opacity-40',
          compact ? 'size-8' : 'h-[38px] w-11',
          open && 'ring-2 ring-[var(--focus)]',
          className,
        )}
        style={{ background: normalizeHex(value) ?? '#ffffff' }}
      />
      {open && (
        <Popover open anchor={trigger} panelRef={panel} role="dialog" width={232}>
          <Palette value={value} onChange={onChange} label={label} />
        </Popover>
      )}
    </>
  );
}

function Palette({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  label: string;
}) {
  const hsv = hexToHsv(value);
  const [hue, setHue] = useState(hsv.h);
  const [text, setText] = useState(value);

  // Цвет мог смениться снаружи — выбором другого блока или отменой действия.
  useEffect(() => setText(value), [value]);

  const apply = (raw: string) => {
    setText(raw);
    const normalized = normalizeHex(raw);
    if (!normalized) return;
    setHue(hexToHsv(normalized).h);
    onChange(normalized);
  };

  return (
    <div className="space-y-2.5 p-2.5">
      <Spectrum
        hue={hue}
        s={hsv.s}
        v={hsv.v}
        onPick={(s, v) => onChange(hsvToHex({ h: hue, s, v }))}
      />
      <Hue
        hue={hue}
        onPick={(h) => {
          setHue(h);
          onChange(hsvToHex({ h, s: hsv.s, v: hsv.v }));
        }}
      />

      <div className="grid grid-cols-5 gap-1.5">
        {SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            onClick={() => apply(hex)}
            className={cn(
              'h-6 rounded-md ring-1 transition-shadow',
              normalizeHex(value) === hex
                ? 'ring-2 ring-[var(--focus)]'
                : 'ring-[var(--line-strong)]',
            )}
            style={{ background: hex }}
          />
        ))}
      </div>

      <input
        type="text"
        value={text}
        spellCheck={false}
        aria-label={`${label}: код`}
        placeholder="#1F5D3F"
        onChange={(e) => apply(e.target.value)}
        // Ушли из поля с недописанным кодом — возвращаем действующий цвет,
        // чтобы в поле не осталось значение, которого нет на листе.
        onBlur={() => setText(value)}
        className="w-full rounded-lg bg-[var(--surface)] px-2 py-1.5 font-mono text-sm uppercase ring-1 ring-[var(--line-strong)] outline-none focus:ring-2 focus:ring-[var(--focus)]"
      />
    </div>
  );
}

/** Квадрат насыщенности и яркости: вправо — насыщеннее, вверх — светлее. */
function Spectrum({
  hue,
  s,
  v,
  onPick,
}: {
  hue: number;
  s: number;
  v: number;
  onPick: (s: number, v: number) => void;
}) {
  const area = useRef<HTMLDivElement>(null);

  const pick = (e: React.PointerEvent) => {
    const box = area.current?.getBoundingClientRect();
    if (!box) return;
    onPick(
      Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      Math.min(1, Math.max(0, 1 - (e.clientY - box.top) / box.height)),
    );
  };

  return (
    <div
      ref={area}
      // Перетаскивание не должно уезжать в прокрутку страницы на сенсорном.
      className="relative h-32 w-full touch-none rounded-lg ring-1 ring-[var(--line)]"
      style={{
        background:
          'linear-gradient(to top, #000, transparent), ' +
          `linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`,
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && pick(e)}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
        style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, boxShadow: '0 0 0 1px #0009' }}
      />
    </div>
  );
}

/** Полоса оттенка. */
function Hue({ hue, onPick }: { hue: number; onPick: (h: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);

  const pick = (e: React.PointerEvent) => {
    const box = strip.current?.getBoundingClientRect();
    if (!box) return;
    onPick(Math.min(360, Math.max(0, ((e.clientX - box.left) / box.width) * 360)));
  };

  return (
    <div
      ref={strip}
      className="relative h-3 w-full touch-none rounded-full ring-1 ring-[var(--line)]"
      style={{
        background:
          'linear-gradient(to right, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)',
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && pick(e)}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-1 ring-[var(--line-strong)]"
        style={{ left: `${(hue / 360) * 100}%` }}
      />
    </div>
  );
}
