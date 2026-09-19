import { useState } from 'react';
import { Check, Mail, Trash2, UserPlus } from 'lucide-react';
import { errorText } from '../api/client';
import { useTeam, useTeamMutations, type TeamMember, type TeamRole } from '../api/team';
import { useMe } from '../auth/useAuth';
import { Button } from '../ui/Button';
import { SectionHead } from '../ui/Settings';
import { Input, Label } from '../ui/Field';
import { ConfirmDialog } from '../ui/Dialog';
import { Select } from '../ui/Select';

/** Понятные названия ролей: слово «роль» человеку ничего не говорит. */
const ROLE_TITLE: Record<TeamRole, string> = {
  owner: 'Владелец',
  admin: 'Управляющий',
  member: 'Сотрудник',
};

const ROLE_HINT: Record<TeamRole, string> = {
  owner: 'Может всё, включая оплату. Один на организацию.',
  admin: 'Может всё, кроме оплаты: добавлять людей, менять настройки, выпускать документы.',
  member: 'Готовит и рассылает документы. Не может добавлять людей и менять настройки.',
};

/**
 * Сотрудники организации.
 *
 * Раньше в организации был ровно один человек — тот, кто её завёл, — и
 * остальные работали под его паролем. Для организации это и неудобно,
 * и делает невозможным ответ на вопрос «кто это выпустил».
 */
export function Team() {
  const me = useMe();
  const team = useTeam();
  const m = useTeamMutations();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  /**
   * Отказ на смену роли или повторное приглашение: «уже вошёл», «свою роль
   * изменить нельзя». Раньше выбор роли молча откатывался, а письмо
   * «не уходило» без единого слова.
   */
  const [actionError, setActionError] = useState<string | null>(null);
  const report = (action: Promise<unknown>) => {
    setActionError(null);
    action.catch((err: unknown) => setActionError(errorText(err)));
  };

  const members = team.data?.members ?? [];
  const myRole = members.find((x) => x.email === me.data?.email)?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';

  return (
    <section>
      <SectionHead title="Кто работает в организации" about={<>Добавьте коллег, чтобы каждый входил под своим именем и паролем. Так видно, кто какие грамоты выпустил, и не приходится передавать один пароль на всех.</>} />

      {team.isPending && <p className="mt-4 text-sm text-[var(--text-muted)]">Загрузка…</p>}

      <ul className="mt-4 space-y-2">
        {members.map((member) => (
          <MemberRow
            key={member.userId}
            member={member}
            canManage={canManage && member.role !== 'owner' && member.email !== me.data?.email}
            onRole={(role) => report(m.setRole.mutateAsync({ userId: member.userId, role }))}
            onRemove={() => setRemoving(member)}
            onResend={() => report(m.resend.mutateAsync(member.userId))}
            resent={m.resend.isSuccess && m.resend.variables === member.userId}
          />
        ))}
      </ul>

      {actionError && (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {actionError}
        </p>
      )}

      {canManage &&
        (adding ? (
          <InviteForm
            pending={m.invite.isPending}
            error={m.invite.error ? errorText(m.invite.error) : null}
            onCancel={() => {
              setAdding(false);
              m.invite.reset();
            }}
            onSubmit={(v) =>
              m.invite.mutate(v, {
                onSuccess: () => setAdding(false),
              })
            }
          />
        ) : (
          <Button className="mt-4" icon={<UserPlus size={15} />} onClick={() => setAdding(true)}>
            Добавить человека
          </Button>
        ))}

      {!canManage && members.length > 0 && (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Добавлять сотрудников может владелец или управляющий.
        </p>
      )}

      {removing && (
        <ConfirmDialog
          title={`Убрать ${removing.name || removing.email} из организации?`}
          confirmLabel="Убрать"
          danger
          pending={m.remove.isPending}
          error={m.remove.error ? errorText(m.remove.error) : null}
          onClose={() => {
            setRemoving(null);
            m.remove.reset();
          }}
          onConfirm={() =>
            m.remove.mutate(removing.userId, { onSuccess: () => setRemoving(null) })
          }
        >
          Выпущенные им документы останутся в реестре.
        </ConfirmDialog>
      )}
    </section>
  );
}

function MemberRow({
  member,
  canManage,
  onRole,
  onRemove,
  onResend,
  resent,
}: {
  member: TeamMember;
  canManage: boolean;
  onRole: (role: 'admin' | 'member') => void;
  onRemove: () => void;
  onResend: () => void;
  resent: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface)] px-4 py-3 ring-1 ring-[var(--line)]">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {member.name || member.email}
          {member.pending && (
            <span className="ml-2 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-normal text-[var(--text-muted)]">
              приглашение отправлено
            </span>
          )}
        </p>
        {/* Адрес второй строкой — только если сверху имя. Иначе он
            повторялся бы сам под собой, и строка выглядела бы ошибкой. */}
        {member.name && (
          <p className="truncate text-sm text-[var(--text-muted)]">{member.email}</p>
        )}
      </div>

      {canManage ? (
        <Select
          /* Владелец сюда не доходит: canManage выше гасит и его строку,
             и свою собственную. Роли «владелец» в списке нет намеренно —
             её не выдают и не снимают. */
          value={member.role as 'admin' | 'member'}
          onChange={onRole}
          options={[
            { value: 'member' as const, label: ROLE_TITLE.member },
            { value: 'admin' as const, label: ROLE_TITLE.admin },
          ]}
          className="w-44"
          aria-label={`Права: ${member.name || member.email}`}
        />
      ) : (
        <span className="text-sm text-[var(--text-muted)]">{ROLE_TITLE[member.role]}</span>
      )}

      {/* Письма теряются в спаме — кнопка выслать заново нужна всегда,
          иначе единственный выход это завести человека заново. */}
      {member.pending && canManage && (
        <button
          type="button"
          onClick={onResend}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-[var(--line-strong)] hover:bg-[var(--surface-sunken)]"
        >
          {resent ? <Check size={14} /> : <Mail size={14} />}
          {resent ? 'Отправлено' : 'Выслать снова'}
        </button>
      )}

      {canManage && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Убрать ${member.name || member.email}`}
          className="text-[var(--text-muted)] hover:text-[var(--danger)]"
        >
          <Trash2 size={16} />
        </button>
      )}
    </li>
  );
}

function InviteForm({
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  error: string | null;
  onSubmit: (v: { email: string; name: string; role: 'admin' | 'member' }) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim() && name.trim()) onSubmit({ email: email.trim(), name: name.trim(), role });
      }}
      className="mt-4 space-y-4 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]"
    >
      <p className="text-sm text-[var(--text-muted)]">
        Человеку придёт письмо со ссылкой. Пароль он придумает сам — вам его знать не нужно.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Имя</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Мария Петрова"
            autoFocus
          />
        </div>
        <div>
          <Label>Адрес почты</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="maria@example.ru"
          />
        </div>
      </div>

      <div>
        <Label>Что он сможет делать</Label>
        <Select
          value={role}
          onChange={setRole}
          options={[
            { value: 'member' as const, label: ROLE_TITLE.member },
            { value: 'admin' as const, label: ROLE_TITLE.admin },
          ]}
        />
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">{ROLE_HINT[role]}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending || !email.trim() || !name.trim()}>
          {pending ? 'Отправляем…' : 'Отправить приглашение'}
        </Button>
        <Button type="button" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
