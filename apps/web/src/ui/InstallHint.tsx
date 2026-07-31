import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from './Button';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'laureat.install-hint-dismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari на iOS не поддерживает display-mode и использует своё свойство.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Предложение установить приложение на устройство.
 *
 * В Chrome и на Android браузер сам присылает событие с готовым диалогом.
 * В Safari на iOS такого события нет вообще — установка возможна только
 * вручную через «Поделиться», и там же спрятана единственная возможность
 * получать уведомления: без добавления на домашний экран iOS их не показывает.
 * Поэтому для iOS показываем инструкцию, а не кнопку.
 */
export function InstallHint() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY)) return;

    if (isIos()) {
      setShowIosHint(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setPromptEvent(null);
    setShowIosHint(false);
  }

  if (!promptEvent && !showIosHint) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-xl bg-[var(--surface)] p-4 shadow-lg ring-1 ring-[var(--line)]">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
          <Download size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Установить приложение</p>
          {showIosHint ? (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-[var(--text-muted)]">
              Нажмите <Share size={14} className="inline" /> «Поделиться», затем «На экран
              «Домой»». Так приложение откроется без адресной строки и сможет присылать
              уведомления о готовности документов.
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Откроется в отдельном окне и будет присылать уведомления, когда документы готовы.
            </p>
          )}
          {promptEvent && (
            <Button
              variant="primary"
              size="sm"
              className="mt-3"
              onClick={() => {
                void promptEvent.prompt().then(() => dismiss());
              }}
            >
              Установить
            </Button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Скрыть предложение"
          className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
