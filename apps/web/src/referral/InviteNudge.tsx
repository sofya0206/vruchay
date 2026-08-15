import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, X } from 'lucide-react';

const KEY = 'vruchay:invite-nudge';
/** Реже раза в неделю — иначе это не предложение, а попрошайничество. */
const QUIET_DAYS = 7;
/** Ниже этого числа выпуск не тянет на «сэкономил вечер», и звать рано. */
const MIN_DOCUMENTS = 5;

/**
 * Предложение позвать коллегу — сразу после успешного выпуска.
 *
 * Момент выбран не случайно: рекомендуют то, чем только что остались
 * довольны. В настройках этот же раздел лежит постоянно, но туда заходят
 * по делу, а не в настроении рассказывать знакомым.
 *
 * Показывается только после удачного выпуска и не чаще раза в неделю.
 * Напоминание, которое видно каждый раз, перестают читать вместе со всем
 * остальным, что мы пишем на этой странице.
 */
export function InviteNudge({ documentsMade }: { documentsMade: number }) {
  const [hidden, setHidden] = useState(false);

  if (hidden || documentsMade < MIN_DOCUMENTS || !quietPeriodPassed()) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 text-sm">
      <Gift size={15} className="text-[var(--accent)]" />
      <span className="text-[var(--text-muted)]">
        Знаете коллегу, который до сих пор подписывает грамоты вручную?
      </span>
      <Link
        to="/settings"
        onClick={remember}
        className="underline underline-offset-2 hover:text-[var(--text)]"
      >
        Пригласить и получить бесплатные документы
      </Link>
      <button
        onClick={() => {
          remember();
          setHidden(true);
        }}
        aria-label="Скрыть"
        className="ml-auto text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function quietPeriodPassed(): boolean {
  try {
    const last = Number(localStorage.getItem(KEY) ?? 0);
    return Date.now() - last > QUIET_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    // Хранилище недоступно — показываем. Лишнее напоминание переживаемо,
    // а вот падение из-за приватного режима браузера — нет.
    return true;
  }
}

function remember(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* нечего запоминать */
  }
}
