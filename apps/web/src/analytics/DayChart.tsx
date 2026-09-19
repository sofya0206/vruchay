import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DayPoint } from '../api/analytics';
import { cn } from '../ui/cn';

/**
 * Столбики по дням на своём SVG — без библиотеки.
 *
 * Одна шкала на график: два ряда (выпуск и проверки) стоят друг под другом
 * на общей оси дат, а не на двух шкалах в одном поле. Наведение показывает
 * день и число, крупные точки ряда подписаны прямо на столбике.
 * Периоды длиннее ста дней сворачиваются в недели: 365 столбиков
 * на ширине карточки не разглядеть.
 */

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

interface Bucket {
  from: string;
  to: string;
  n: number;
}

/** Дни → недели, когда точек слишком много для ширины карточки. */
export function bucketize(points: DayPoint[], max = 100): Bucket[] {
  if (points.length <= max) return points.map((p) => ({ from: p.day, to: p.day, n: p.n }));
  const size = Math.ceil(points.length / max) > 1 ? 7 : 1;
  const out: Bucket[] = [];
  for (let i = 0; i < points.length; i += size) {
    const slice = points.slice(i, i + size);
    out.push({
      from: slice[0].day,
      to: slice[slice.length - 1].day,
      n: slice.reduce((s, p) => s + p.n, 0),
    });
  }
  return out;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function DayChart({
  points,
  tone = 'accent',
  height = 140,
  label,
  unit,
}: {
  points: DayPoint[];
  tone?: 'accent' | 'ok';
  height?: number;
  /** Подпись ряда для скринридера и подсказки: «выпущено». */
  label: string;
  /** Единица в подсказке: (n) => «12 документов». */
  unit: (n: number) => string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const buckets = useMemo(() => bucketize(points), [points]);

  const padL = 34;
  const padR = 6;
  const padT = 10;
  const padB = 20;
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padT - padB;
  const slot = buckets.length ? innerW / buckets.length : 0;
  const bar = Math.max(2, Math.min(28, slot - 2));
  const y = (n: number) => padT + innerH * (1 - n / max);
  const ticks = max <= 2 ? [0, max] : [0, Math.round(max / 2), max];
  const fill = tone === 'ok' ? 'var(--ok)' : 'var(--accent)';
  const weekly = buckets.length > 0 && buckets[0].from !== buckets[0].to;
  const total = buckets.reduce((s, b) => s + b.n, 0);

  const hovered = hover !== null ? buckets[hover] : null;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label} по ${weekly ? 'неделям' : 'дням'}: ${unit(total)} за период`}
          className="block"
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text
                x={padL - 6}
                y={y(t) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-muted)"
              >
                {t}
              </text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const x = padL + i * slot + (slot - bar) / 2;
            const h = innerH * (b.n / max);
            const dim = hover !== null && hover !== i;
            return (
              <g key={b.from} onMouseEnter={() => setHover(i)}>
                {/* Широкая невидимая зона: попасть мышью в столбик шириной 3px нельзя. */}
                <rect
                  x={padL + i * slot}
                  y={padT}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                />
                {b.n > 0 && (
                  <rect
                    x={x}
                    y={y(b.n)}
                    width={bar}
                    height={Math.max(2, h)}
                    rx={Math.min(3, bar / 2)}
                    fill={fill}
                    opacity={dim ? 0.45 : 1}
                    style={{ transition: 'opacity 150ms' }}
                  />
                )}
              </g>
            );
          })}
          <line
            x1={padL}
            x2={width - padR}
            y1={padT + innerH}
            y2={padT + innerH}
            stroke="var(--line-strong)"
          />
          {buckets.length > 1 && (
            <>
              <text x={padL} y={height - 5} fontSize="11" fill="var(--text-muted)">
                {shortDay(buckets[0].from)}
              </text>
              <text
                x={width - padR}
                y={height - 5}
                fontSize="11"
                textAnchor="end"
                fill="var(--text-muted)"
              >
                {shortDay(buckets[buckets.length - 1].to)}
              </text>
            </>
          )}
        </svg>
      )}
      {hovered && hover !== null && (
        <div
          role="status"
          className={cn(
            'pointer-events-none absolute top-0 z-10 rounded-lg bg-[var(--text)] px-2.5 py-1.5 text-xs text-[var(--ground)] shadow-[var(--shadow-md)]',
          )}
          style={{
            left: Math.min(
              Math.max(0, padL + hover * slot + slot / 2 - 60),
              Math.max(0, width - 130),
            ),
          }}
        >
          <div className="text-[var(--ground)]/70">
            {hovered.from === hovered.to
              ? shortDay(hovered.from)
              : `${shortDay(hovered.from)} — ${shortDay(hovered.to)}`}
          </div>
          <div className="font-medium tabular-nums">{unit(hovered.n)}</div>
        </div>
      )}
    </div>
  );
}

/** Маленькая линия за период — для плиток. Без осей и подписей: это намёк, а не график. */
export function Sparkline({
  points,
  tone = 'accent',
  className = '',
}: {
  points: DayPoint[];
  tone?: 'accent' | 'ok';
  className?: string;
}) {
  const w = 84;
  const h = 28;
  const buckets = bucketize(points, 60);
  if (buckets.length < 2) return null;
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const pts = buckets.map(
    (b, i) =>
      `${((i * (w - 2)) / (buckets.length - 1) + 1).toFixed(1)},${(h - 2 - (h - 6) * (b.n / max)).toFixed(1)}`,
  );
  const stroke = tone === 'ok' ? 'var(--ok)' : 'var(--accent)';
  const last = pts[pts.length - 1].split(',');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden className={className}>
      <path d={`M${pts.join(' L')} L${w - 1},${h - 1} L1,${h - 1}Z`} fill={stroke} opacity={0.12} />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.4} fill={stroke} />
    </svg>
  );
}
