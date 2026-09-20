import { FormEvent, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { securityApi, useTotpStatus, type TotpSetup } from '../api/security';
import { ApiError } from '../api/client';
import { Button } from '../ui/Button';
import { SectionHead } from '../ui/Settings';
import { Input, Label, StatusChip } from '../ui/Field';

/**
 * Второй фактор входа.
 *
 * Экран ведёт по одному шагу за раз: пока не показан QR — нечего вводить,
 * пока не введён код — 2FA не включена. Резервные коды показываются
 * ровно один раз: на сервере лежат только их хеши, и повторить показ
 * нельзя даже нам.
 */
export function TwoFactor() {
  const qc = useQueryClient();
  const status = useTotpStatus();
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  useEffect(() => {
    if (!setup) {
      setQr('');
      return;
    }
    void QRCode.toDataURL(setup.otpauth, { margin: 1, width: 220 }).then(setQr);
  }, [setup]);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Не получилось');
  const refresh = () => qc.invalidateQueries({ queryKey: ['totp'] });

  const begin = useMutation({
    mutationFn: securityApi.totpSetup,
    onSuccess: (data) => {
      setSetup(data);
      setError('');
    },
    onError: fail,
  });

  const enable = useMutation({
    mutationFn: () => securityApi.totpEnable(code),
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setSetup(null);
      setCode('');
      setError('');
      void refresh();
    },
    onError: fail,
  });

  if (status.isPending) return null;
  const enabled = status.data?.enabled ?? false;

  return (
    <section>
      <SectionHead title="Вход по коду" about={<>Второй шаг после пароля: шесть цифр из приложения на телефоне. Украденного пароля станет мало, чтобы войти в кабинет и выпустить документы от вашего имени.</>} />

      <div className="mt-4 max-w-xl space-y-4 rounded-sheet bg-surface p-4 ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-3">
          {enabled ? (
            <StatusChip tone="done">
              <ShieldCheck size={13} /> Включён
            </StatusChip>
          ) : (
            <StatusChip tone="neutral">
              <ShieldOff size={13} /> Выключен
            </StatusChip>
          )}
          {enabled && (
            <span className="text-sm text-muted">
              Резервных кодов осталось: {status.data?.backupCodesLeft ?? 0}
            </span>
          )}
        </div>

        {backupCodes && <BackupCodes codes={backupCodes} onDone={() => setBackupCodes(null)} />}

        {!enabled && !setup && !backupCodes && (
          <Button variant="primary" onClick={() => begin.mutate()} disabled={begin.isPending}>
            Подключить приложение
          </Button>
        )}

        {!enabled && setup && (
          <div className="space-y-3">
            <p className="text-sm">
              Отсканируйте код в приложении — подойдёт любое: Яндекс Ключ, Google Authenticator,
              1Password, Aegis.
            </p>
            {qr && (
              <img
                src={qr}
                alt="QR-код для приложения проверки подлинности"
                className="rounded-control bg-[var(--sheet-paper)] p-2"
                width={220}
                height={220}
              />
            )}
            <p className="text-sm text-muted">
              Камера не читает? Введите ключ вручную:{' '}
              <code className="font-mono break-all text-ink">{setup.secret}</code>
            </p>

            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                enable.mutate();
              }}
            >
              <div className="w-40">
                <Label>Код из приложения</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                />
              </div>
              <Button type="submit" variant="primary" disabled={enable.isPending}>
                Включить
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                Отмена
              </Button>
            </form>
          </div>
        )}

        {enabled && <ManageEnabled onCodes={setBackupCodes} onChanged={refresh} />}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

/** Выключение и новые резервные коды — оба действия требуют пароль. */
function ManageEnabled({
  onCodes,
  onChanged,
}: {
  onCodes: (codes: string[]) => void;
  onChanged: () => void;
}) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'none' | 'disable' | 'codes'>('none');

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Не получилось');
  const done = () => {
    setPassword('');
    setCode('');
    setError('');
    setMode('none');
    onChanged();
  };

  const disable = useMutation({
    mutationFn: () => securityApi.totpDisable(password, code),
    onSuccess: done,
    onError: fail,
  });

  const regenerate = useMutation({
    mutationFn: () => securityApi.regenerateBackupCodes(password),
    onSuccess: (data) => {
      onCodes(data.backupCodes);
      done();
    },
    onError: fail,
  });

  if (mode === 'none') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<KeyRound size={14} />} onClick={() => setMode('codes')}>
          Новые резервные коды
        </Button>
        <Button size="sm" variant="danger" onClick={() => setMode('disable')}>
          Выключить
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (mode === 'disable') disable.mutate();
        else regenerate.mutate();
      }}
    >
      <p className="text-sm text-muted">
        {mode === 'disable'
          ? 'Выключение снимает защиту со входа — подтвердите паролем и кодом.'
          : 'Старые резервные коды перестанут действовать сразу.'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Label>Пароль</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {mode === 'disable' && (
          <div className="w-40">
            <Label>Код</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
            />
          </div>
        )}
        <Button
          type="submit"
          variant={mode === 'disable' ? 'danger' : 'primary'}
          disabled={disable.isPending || regenerate.isPending}
        >
          {mode === 'disable' ? 'Выключить' : 'Выпустить коды'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode('none')}>
          Отмена
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * Резервные коды. Показываются один раз — дальше на сервере только хеши,
 * поэтому убрать их с экрана можно лишь осознанно, отдельной кнопкой.
 */
function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="rounded-card bg-accent-soft p-4">
      <h3 className="font-medium">Резервные коды</h3>
      <p className="mt-1 text-sm text-muted">
        Каждый работает один раз — вместо кода из приложения, если телефон потерян. Сохраните их
        сейчас: показать их ещё раз не сможем и мы.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-3">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => void navigator.clipboard.writeText(codes.join('\n'))}>
          Скопировать
        </Button>
        <Button size="sm" variant="primary" onClick={onDone}>
          Я сохранил коды
        </Button>
      </div>
    </div>
  );
}
