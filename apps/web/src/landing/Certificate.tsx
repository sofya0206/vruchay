/**
 * Наградной документ на первом экране.
 *
 * Собран приёмами настоящей полиграфии, а не «карточка с тенью»: гильоширная
 * сетка на полях, двойная рамка с отбивкой, тиснёная печать, тёплый тон бумаги
 * и текстура зерна. Именно по этим признакам человек, державший в руках
 * грамоту, отличает солидный документ от распечатки.
 *
 * Отрисовано разметкой, а не картинкой: масштабируется без потерь, живёт
 * в светлой и тёмной теме и весит несколько килобайт вместо мегабайта.
 *
 * За основным листом — ещё два, веером. Это главное обещание страницы,
 * показанное вместо того, чтобы быть описанным: документов много.
 */

/** Гильоширная сетка — переплетение тонких дуг, как на бланках и облигациях. */
function Guilloche({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.4"
    >
      {Array.from({ length: 14 }, (_, i) => (
        <circle key={i} cx="60" cy="60" r={12 + i * 3.4} opacity={0.5 - i * 0.02} />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <ellipse
          key={`e${i}`}
          cx="60"
          cy="60"
          rx="46"
          ry="17"
          opacity="0.28"
          transform={`rotate(${i * 15} 60 60)`}
        />
      ))}
    </svg>
  );
}

export function Certificate() {
  return (
    <div className="vru-enter vru-delay relative mx-auto w-full max-w-md">
      {/* Листы за основным: обещание «на весь список» показано, а не описано. */}
      <div className="absolute inset-0 translate-x-4 translate-y-4 rotate-[3deg] rounded-lg bg-[var(--surface-sunken)] ring-1 ring-[var(--line)]" />
      <div className="absolute inset-0 translate-x-2 translate-y-2 rotate-[1.5deg] rounded-lg bg-[var(--surface)] ring-1 ring-[var(--line)]" />

      <div className="relative rotate-[-1deg] rounded-lg bg-[var(--surface)] p-1.5 shadow-[0_24px_70px_-24px_rgba(20,32,26,0.45)] ring-1 ring-[var(--line)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:rotate-0 motion-reduce:transition-none">
        {/* Внешняя рамка с отбивкой — как поле настоящего бланка. */}
        <div className="relative overflow-hidden rounded border border-[var(--award)]/35 px-7 py-8">
          {/* Тон бумаги: тёплая подложка под золотом, а не чистый белый. */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,var(--award-soft)_0%,transparent_62%)] opacity-70" />
          <Guilloche className="pointer-events-none absolute -top-14 -left-16 h-52 w-52 text-[var(--award)] opacity-[0.22]" />
          <Guilloche className="pointer-events-none absolute -right-16 -bottom-14 h-52 w-52 text-[var(--award)] opacity-[0.18]" />

          <div className="relative text-center">
            <p className="text-[10px] tracking-[0.3em] text-[var(--text-muted)] uppercase">
              Ассоциация тренеров
            </p>
            <div className="mx-auto mt-3 h-px w-12 bg-[var(--award)]/45" />

            <p className="mt-6 font-serif text-[2rem] leading-none tracking-wide">Грамота</p>

            <p className="mt-6 text-xs text-[var(--text-muted)]">награждается</p>
            {/* Имя — самое крупное после заголовка: документ именной. */}
            <p className="mt-1.5 font-serif text-xl">Кузьмина-Караваева Анна</p>

            <p className="mx-auto mt-3 max-w-[16rem] text-xs leading-relaxed text-[var(--text-muted)]">
              за первое место на дистанции 200 метров вольным стилем
            </p>

            <div className="mt-8 flex items-end justify-between">
              <div className="text-left">
                <p className="font-serif text-sm">2 августа 2026</p>
                <p className="text-[10px] text-[var(--text-muted)]">Челябинск</p>
              </div>

              <Seal />

              <div className="text-right">
                {/* Код проверки подлинности — то, чего нет ни у кого на рынке. */}
                <QrMark />
                <p className="mt-1 text-[9px] text-[var(--text-muted)]">проверка</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Тиснёная печать: кольцо с зубцами и монограмма. */
function Seal() {
  return (
    <div className="relative -mb-1 grid h-14 w-14 place-items-center">
      <svg viewBox="0 0 56 56" className="absolute inset-0 text-[var(--award)]" aria-hidden="true">
        <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <circle cx="28" cy="28" r="20" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
        {Array.from({ length: 36 }, (_, i) => (
          <line
            key={i}
            x1="28"
            y1="3.5"
            x2="28"
            y2="7"
            stroke="currentColor"
            strokeWidth="0.7"
            opacity="0.42"
            transform={`rotate(${i * 10} 28 28)`}
          />
        ))}
      </svg>
      <span className="font-serif text-lg text-[var(--award)] opacity-80">В</span>
    </div>
  );
}

/** Условный код: рисунок, а не настоящая ссылка — это витрина, не документ. */
function QrMark() {
  const cells = [
    1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1,
    0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1,
  ];
  return (
    <div className="ml-auto grid h-9 w-9 grid-cols-8 gap-px" aria-hidden="true">
      {cells.map((on, i) => (
        <span key={i} className={on ? 'bg-[var(--text)] opacity-75' : ''} />
      ))}
    </div>
  );
}
