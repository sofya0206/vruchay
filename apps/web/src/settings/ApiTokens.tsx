import { useState } from 'react';
import { Check, Copy, KeyRound, Plus, TriangleAlert, X } from 'lucide-react';
import { ApiError, errorText } from '../api/client';
import { useTokens, useTokenMutations, type ApiTokenInfo, type TokenRole } from '../api/tokens';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';
import { Select } from '../ui/Select';

const ROLE_TITLE: Record<TokenRole, string> = {
  member: 'Выпускать документы',
  admin: 'Полный доступ',
};

/**
 * Токены для чужих программ.
 *
 * Раздел для тех немногих, кому он нужен: подрядчик пишет выгрузку
 * из внешней системы, организация подключает свой бот. Поэтому свёрнут по
 * умолчанию — остальным он только мешал бы, а объяснить, что такое
 * «токен доступа», человеку, который пришёл выпустить грамоты,
 * невозможно и не нужно.
 */
export function ApiTokens() {
  const [open, setOpen] = useState(false);
  const { data, isError } = useTokens();

  return (
    <section>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-lg font-medium"
        aria-expanded={open}
      >
        <KeyRound size={18} className="text-[var(--accent)]" />
        Доступ для программ
        <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-normal text-[var(--text-muted)]">
          {open ? 'скрыть' : 'показать'}
        </span>
      </button>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)] max-md:hidden">
        Нужно, только если вы подключаете сервис к своей программе или сайту. Для обычной работы
        в кабинете это не требуется.
      </p>

      {open && (
        <div className="mt-4 max-w-2xl">
          {isError ? (
            <p className="text-sm text-[var(--text-muted)]">
              Доступ к токенам есть у владельца и управляющего.
            </p>
          ) : (
            <>
              <NewToken />
              <TokenList tokens={data ?? []} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function NewToken() {
  const { create } = useTokenMutations();
  const [name, setName] = useState('');
  const [role, setRole] = useState<TokenRole>('member');
  const [issued, setIssued] = useState<string | null>(null);

  if (issued) return <IssuedToken token={issued} onClose={() => setIssued(null)} />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ name, role }, { onSuccess: (r) => { setIssued(r.token); setName(''); } });
      }}
      className="flex flex-wrap items-end gap-3 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
    >
      <div className="min-w-52 flex-1">
        <Label>Для чего токен</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="выгрузка из CRM"
          maxLength={100}
        />
      </div>
      <div>
        <Label>Права</Label>
        <Select
          value={role}
          onChange={setRole}
          options={[
            { value: 'member' as TokenRole, label: ROLE_TITLE.member },
            { value: 'admin' as TokenRole, label: ROLE_TITLE.admin },
          ]}
        />
      </div>
      <Button
        type="submit"
        variant="primary"
        icon={<Plus size={15} />}
        disabled={!name.trim() || create.isPending}
      >
        Выдать
      </Button>

      {create.isError && (
        <p role="alert" className="w-full text-sm text-[var(--danger)]">
          {errorText(create.error)}
        </p>
      )}
    </form>
  );
}

/**
 * Токен показывается один раз — и об этом надо сказать до того, как
 * человек закроет окно, а не после.
 */
function IssuedToken({ token, onClose }: { token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-2xl bg-[var(--accent-soft)] p-4">
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        Скопируйте токен сейчас — больше он нигде не покажется
      </p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Мы храним не сам токен, а его отпечаток: даже нам его не восстановить. Потеряете — выдадите
        новый, ничего страшного.
      </p>

      <code className="mt-3 block overflow-x-auto rounded-xl bg-[var(--surface)] px-3 py-2.5 font-mono text-sm">
        {token}
      </code>

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="primary"
          icon={copied ? <Check size={15} /> : <Copy size={15} />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(token);
              setCopied(true);
            } catch {
              // Буфер недоступен — токен виден на экране целиком,
              // выделяется руками. Ложную галочку не ставим.
            }
          }}
        >
          {copied ? 'Скопирован' : 'Скопировать'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Готово
        </Button>
      </div>
    </div>
  );
}

function TokenList({ tokens }: { tokens: ApiTokenInfo[] }) {
  const { revoke } = useTokenMutations();
  const [asking, setAsking] = useState<string | null>(null);
  /**
   * Токен отзывают, когда он утёк, — молчаливый отказ оставил бы доступ
   * открытым у человека, уверенного в обратном. 404 — токен уже отозван.
   */
  const [error, setError] = useState<string | null>(null);

  if (tokens.length === 0) {
    return <p className="mt-3 text-sm text-[var(--text-muted)]">Действующих токенов нет.</p>;
  }

  return (
    <>
      <ul className="mt-3 divide-y divide-[var(--line)] rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--line)]">
        {tokens.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-40 flex-1">
              <div className="font-medium">{t.name}</div>
              <div className="text-sm text-[var(--text-muted)]">
                <code className="font-mono">{t.prefix}…</code> · {ROLE_TITLE[t.role]} ·{' '}
                {t.lastUsedAt ? `работал ${when(t.lastUsedAt)}` : 'ни разу не использован'}
              </div>
            </div>

            {asking === t.id ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  Программа, которая им пользуется, перестанет работать.
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={revoke.isPending}
                  onClick={() => {
                    setError(null);
                    revoke.mutateAsync(t.id).catch((err: unknown) => {
                      if (!(err instanceof ApiError && err.status === 404))
                        setError(errorText(err));
                    });
                    setAsking(null);
                  }}
                >
                  Отозвать
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X size={14} />}
                  onClick={() => setAsking(null)}
                />
              </div>
            ) : (
              <button
                onClick={() => setAsking(t.id)}
                className="text-sm text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]"
              >
                Отозвать
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </>
  );
}

function when(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(new Date(iso));
}
