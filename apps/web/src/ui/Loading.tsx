import { Award } from 'lucide-react';

/**
 * Загрузка внутри приложения.
 *
 * Тот же знак, что и на заставке в index.html: человек, дождавшийся
 * запуска кода, не должен увидеть, как одна картинка ожидания сменяется
 * другой — это читается как сбой, а не как продолжение.
 *
 * Появляется с задержкой (см. .vru-loading): почти всегда данные приходят
 * за долю секунды, и мелькнувшая надпись хуже, чем её отсутствие.
 */
export function Loading({ label = 'Загружаем' }: { label?: string }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="vru-loading text-center">
        <span
          className="vru-beat mx-auto grid h-14 w-14 place-items-center rounded-2xl
                     bg-[var(--accent)] text-[var(--accent-contrast)]"
        >
          <Award size={28} strokeWidth={1.75} />
        </span>
        <p className="mt-4 text-sm text-[var(--text-muted)]">{label}</p>
      </div>
    </div>
  );
}
