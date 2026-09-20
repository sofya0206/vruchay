import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';

/**
 * Оценка оставшегося времени по скорости последних пакетов.
 *
 * Считается грубо и говорится грубо: «около 2 минут», а не «1:53».
 * Первые секунды скорость неизвестна — молчим, а не пугаем «∞».
 */
export function useEta(done: number, total: number, running: boolean): string | null {
  const samples = useRef<{ t: number; done: number }[]>([]);
  const [eta, setEta] = useState<string | null>(null);

  useEffect(() => {
    if (!running) {
      samples.current = [];
      setEta(null);
      return;
    }
    const now = Date.now();
    const list = samples.current;
    if (list.length === 0 || list[list.length - 1].done !== done) list.push({ t: now, done });
    while (list.length > 8) list.shift();
    if (list.length < 2) return;
    const first = list[0];
    const last = list[list.length - 1];
    const perMs = (last.done - first.done) / Math.max(1, last.t - first.t);
    if (perMs <= 0) return;
    setEta(humanize((total - done) / perMs));
  }, [done, total, running]);

  return eta;
}

function humanize(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 10) return 'несколько секунд';
  if (s < 60) return `около ${Math.round(s / 10) * 10} секунд`;
  const m = Math.round(s / 60);
  if (m < 60) return `около ${m} ${plural(m, 'минуты', 'минут', 'минут')}`;
  const h = Math.round(m / 60);
  return `около ${h} ${plural(h, 'часа', 'часов', 'часов')}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/**
 * Полоса долгой операции: число, процент, время, «можно уйти».
 *
 * Полоса детерминированная только потому, что сервер честно отдаёт
 * done/total; иначе показывать её нельзя. Читалке отдаём одну фразу
 * через aria-live, а не каждое обновление полосы.
 */
export function ProgressBar({
  done,
  total,
  failed = 0,
  label = 'Выпускаем документы',
  running = true,
  className = '',
}: {
  done: number;
  total: number;
  failed?: number;
  label?: string;
  running?: boolean;
  className?: string;
}) {
  const eta = useEta(done + failed, total, running);
  const percent = total > 0 ? Math.round(((done + failed) / total) * 100) : 0;

  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted">
          {done + failed} из {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done + failed}
        aria-label={`${label}: ${done + failed} из ${total}`}
        className="h-1.5 overflow-hidden rounded-full bg-sunken"
      >
        <div className="flex h-full">
          <span
            className="block h-full bg-accent transition-[width] duration-320"
            style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
          />
          {failed > 0 && (
            <span
              className="block h-full bg-danger transition-[width] duration-320"
              style={{ width: `${(failed / total) * 100}%` }}
            />
          )}
        </div>
      </div>
      <div
        className="flex justify-between gap-3 text-xs text-muted"
        aria-live="polite"
      >
        <span>
          {percent}%{eta && running ? ` · ${eta}` : ''}
          {failed > 0 && <span className="text-danger"> · ошибок {failed}</span>}
        </span>
        {running && <span>Можно закрыть вкладку</span>}
      </div>
    </div>
  );
}
