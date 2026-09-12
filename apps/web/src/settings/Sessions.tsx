import { LogOut, MonitorSmartphone } from 'lucide-react';
import {
  useLoginHistory,
  useSessionMutations,
  useSessions,
  type LoginOutcome,
} from '../api/security';
import { usePreferences } from '../api/org';
import { formatDateTime } from './preferences';
import { Button } from '../ui/Button';
import { StatusChip } from '../ui/Field';

/** Почему вход не удался — по-русски, а не кодом из базы. */
const OUTCOME: Record<LoginOutcome, string> = {
  success: 'Вход выполнен',
  wrong_password: 'Неверный пароль',
  wrong_code: 'Неверный код',
  not_verified: 'Адрес не подтверждён',
};

/**
 * Активные сессии и журнал входов.
 *
 * Обе таблицы отвечают на один вопрос: «не заходил ли в мою учётную запись
 * кто-то ещё». Поэтому неудачные попытки показываются вместе с удачными —
 * ряд отказов подряд и есть первый признак подбора пароля.
 */
export function Sessions() {
  const sessions = useSessions();
  const { revoke, revokeOthers } = useSessionMutations();
  const prefs = usePreferences();
  const format = prefs.data?.dateFormat;

  const others = (sessions.data ?? []).filter((s) => !s.current).length;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <MonitorSmartphone size={18} className="text-[var(--accent)]" />
        Устройства
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Где вы вошли прямо сейчас. Забытый вход на чужом компьютере закрывается отсюда — для этого
        не нужно ни менять пароль, ни искать тот компьютер.
      </p>

      <ul className="mt-4 max-w-2xl space-y-2">
        {sessions.data?.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface)] p-3 ring-1 ring-[var(--line)]"
          >
            <div className="min-w-48 flex-1">
              <p className="flex items-center gap-2 text-sm">
                {s.device}
                {s.current && <StatusChip tone="done">Это устройство</StatusChip>}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {s.ip ?? 'адрес неизвестен'} · вход {formatDateTime(s.createdAt, format)} · был
                здесь {formatDateTime(s.lastSeenAt, format)}
              </p>
            </div>
            {!s.current && (
              <Button
                size="sm"
                variant="danger"
                icon={<LogOut size={14} />}
                onClick={() => revoke.mutate(s.id)}
                disabled={revoke.isPending}
              >
                Завершить
              </Button>
            )}
          </li>
        ))}
      </ul>

      {others > 0 && (
        <Button
          className="mt-3"
          variant="danger"
          onClick={() => revokeOthers.mutate()}
          disabled={revokeOthers.isPending}
        >
          Завершить остальные ({others})
        </Button>
      )}

      <LoginHistory />
    </section>
  );
}

function LoginHistory() {
  const events = useLoginHistory();
  const prefs = usePreferences();
  const format = prefs.data?.dateFormat;

  return (
    <div className="mt-8">
      <h3 className="font-medium">Журнал входов</h3>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Последние попытки войти в вашу учётную запись — и удачные, и нет.
      </p>

      {events.data?.length === 0 && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">Пока ни одной записи.</p>
      )}

      <ul className="mt-3 max-w-2xl divide-y divide-[var(--line)] rounded-xl bg-[var(--surface)] ring-1 ring-[var(--line)]">
        {events.data?.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className={e.outcome === 'success' ? '' : 'text-[var(--danger)]'}>
              {OUTCOME[e.outcome]}
            </span>
            <span className="text-[var(--text-muted)]">{e.device}</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">
              {e.ip ?? '—'} · {formatDateTime(e.createdAt, format)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
