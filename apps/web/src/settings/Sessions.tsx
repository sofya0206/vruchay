import { useState } from 'react';
import { ApiError, errorText } from '../api/client';
import {
  useLoginHistory,
  useSessionMutations,
  useSessions,
  type LoginOutcome,
} from '../api/security';
import { usePreferences } from '../api/org';
import { formatDateTime } from './preferences';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SettingRow, SettingRows, SettingsSection, SettingsStack } from '../ui/Settings';

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
  /**
   * Молчать здесь нельзя: человек закрывает забытый вход на чужом
   * компьютере и уходит, уверенный, что вход закрыт. 404 — не отказ:
   * вход уже закрыт, и строка уйдёт с обновлением списка.
   */
  const [error, setError] = useState<string | null>(null);
  const report = (action: Promise<unknown>) => {
    setError(null);
    action.catch((err: unknown) => {
      if (!(err instanceof ApiError && err.status === 404)) setError(errorText(err));
    });
  };
  const prefs = usePreferences();
  const format = prefs.data?.dateFormat;

  const others = (sessions.data ?? []).filter((s) => !s.current).length;

  return (
    <SettingsStack>
      <SettingsSection
        title="Устройства"
        about="Где вы вошли прямо сейчас. Забытый вход закрывается отсюда, менять пароль не нужно."
        action={
          others > 0 && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => report(revokeOthers.mutateAsync())}
              disabled={revokeOthers.isPending}
            >
              Завершить остальные · {others}
            </Button>
          )
        }
      >
        <SettingRows>
          {sessions.data?.map((s) => (
            <SettingRow
              key={s.id}
              title={
                <span className="flex items-center gap-2">
                  {s.device}
                  {s.current && <Badge tone="ok">это устройство</Badge>}
                </span>
              }
              about={`${s.ip ?? 'адрес неизвестен'} · вход ${formatDateTime(s.createdAt, format)} · был здесь ${formatDateTime(s.lastSeenAt, format)}`}
            >
              {!s.current && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => report(revoke.mutateAsync(s.id))}
                  disabled={revoke.isPending}
                >
                  Завершить
                </Button>
              )}
            </SettingRow>
          ))}
        </SettingRows>

        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </SettingsSection>

      <LoginHistory />
    </SettingsStack>
  );
}

function LoginHistory() {
  const events = useLoginHistory();
  const prefs = usePreferences();
  const format = prefs.data?.dateFormat;

  return (
    <SettingsSection title="Журнал входов" about="Последние попытки войти, удачные и нет">
      {events.data?.length === 0 && (
        <p className="text-sm text-muted">Пока ни одной записи.</p>
      )}

      <SettingRows>
        {events.data?.map((e) => (
          <div key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm">
            <span className={e.outcome === 'success' ? '' : 'text-danger'}>
              {OUTCOME[e.outcome]}
            </span>
            <span className="text-muted">{e.device}</span>
            <span className="tabular ml-auto text-xs text-muted">
              {e.ip ?? '—'} · {formatDateTime(e.createdAt, format)}
            </span>
          </div>
        ))}
      </SettingRows>
    </SettingsSection>
  );
}
