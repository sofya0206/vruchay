import { useEffect, useState } from 'react';
import { Bell, BellRing, Share, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { enablePush, pushState, type PushState } from './push';

const DISMISSED_KEY = 'vruchay.push-offer-dismissed';

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * «Сообщить, когда будет готово?» — полоса под шапкой, пока идёт выпуск.
 *
 * Разрешение на уведомления просим здесь, а не при первом заходе (ADR-0004):
 * в этот момент польза видна сама — пакет на сотни грамот печатается
 * минутами, и держать открытой вкладку на телефоне никто не станет.
 * Отказ спросить заново браузер не даст, поэтому и не навязываемся:
 * закрытая полоса больше не появляется.
 */
export function PushOffer() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(dismissedBefore);
  const [justEnabled, setJustEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    pushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('unsupported'));
    return () => {
      alive = false;
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Приватный режим — полоса просто вернётся в следующий раз.
    }
    setHidden(true);
  }

  async function enable() {
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      setJustEnabled(next === 'on');
    } catch {
      setState('unsupported');
    } finally {
      setBusy(false);
    }
  }

  if (!state || state === 'unsupported' || state === 'server-off' || state === 'denied') return null;

  // Уже включено: не предлагаем, а успокаиваем — вкладку можно закрыть.
  if (state === 'on') {
    return (
      <Strip icon={<BellRing size={18} />}>
        {justEnabled ? 'Готово — пришлём уведомление' : 'Пришлём уведомление'}, когда документы будут готовы.
        Страницу можно закрыть.
      </Strip>
    );
  }

  if (hidden) return null;

  if (state === 'needs-install') {
    return (
      <Strip icon={<Bell size={18} />} onDismiss={dismiss}>
        Чтобы iPhone сообщил, когда документы будут готовы, добавьте Вручай на экран «Домой»: нажмите{' '}
        <Share size={14} className="inline align-[-2px]" aria-label="Поделиться" /> и «На экран „Домой“».
      </Strip>
    );
  }

  return (
    <Strip
      icon={<Bell size={18} />}
      onDismiss={dismiss}
      action={
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void enable()} className="max-md:h-11 max-md:w-full">
          {busy ? 'Включаем…' : 'Сообщить'}
        </Button>
      }
    >
      Выпуск идёт. Сообщить на это устройство, когда документы будут готовы?
    </Strip>
  );
}

function Strip({
  icon,
  action,
  onDismiss,
  children,
}: {
  icon: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-accent-soft px-4 py-2.5 text-sm"
    >
      <span className="shrink-0 text-accent">{icon}</span>
      <p className="min-w-0 flex-1 text-ink">{children}</p>
      {/* Крестик в разметке раньше кнопки: на телефоне кнопка уходит второй
          строкой во всю ширину, а крестик остаётся справа от текста.
          На широком экране он встаёт последним, как обычно. */}
      {onDismiss && (
        <button
          type="button"
          aria-label="Не предлагать"
          onClick={onDismiss}
          className="grid size-11 shrink-0 place-items-center rounded-control text-muted hover:bg-surface md:order-last md:size-8"
        >
          <X size={16} />
        </button>
      )}
      {action}
    </div>
  );
}
