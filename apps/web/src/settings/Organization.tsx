import { useEffect, useState } from 'react';
import { Building2, Check, UserRound } from 'lucide-react';
import { useOrgProfile, useOrgMutations } from '../api/org';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

/**
 * Название организации и своё имя.
 *
 * Оба задавались один раз при регистрации и застревали навсегда,
 * а название стоит в имени отправителя писем участникам, в приглашении
 * друга и на витрине отзывов. Опечатка расходилась по всем трём местам
 * без всякой возможности её исправить.
 *
 * Разделены на два блока: имя человека живёт в разделе «Аккаунт» рядом
 * с паролем и вторым фактором, название организации — в «Организации»
 * рядом с реквизитами. Раньше это был один экран, и найти в нём
 * что-то конкретное можно было только сверху вниз.
 */
function useSavedFlag() {
  const [saved, setSaved] = useState(false);
  return {
    saved,
    show: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    },
  };
}

function Saved() {
  return (
    <span className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
      <Check size={15} /> Сохранено
    </span>
  );
}

export function OrgName() {
  const { data } = useOrgProfile();
  const { renameOrg } = useOrgMutations();
  const [orgName, setOrgName] = useState('');
  const { saved, show } = useSavedFlag();

  useEffect(() => {
    if (data) setOrgName(data.orgName);
  }, [data]);

  const changed = data ? orgName.trim() !== data.orgName && orgName.trim().length >= 2 : false;

  return (
    <section>
      <h2 className="flex items-center gap-2 font-serif text-xl">
        <Building2 size={18} className="text-[var(--accent)]" />
        Название организации
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Участники увидят его в письме — в поле «от кого», а проверяющие — на странице
        проверки документа.
      </p>

      <div className="mt-4 max-w-md rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
        <Label>Название организации</Label>
        <Input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          maxLength={200}
          placeholder="Спортшкола «Дельфин»"
        />
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          Так и напишите, как принято у вас: «Федерация плавания области», «МБУ ДО СШОР №3».
        </p>
        <div className="mt-2 flex items-center gap-3">
          <Button
            size="sm"
            variant="primary"
            disabled={!changed || renameOrg.isPending}
            onClick={() => renameOrg.mutate(orgName, { onSuccess: show })}
          >
            {renameOrg.isPending ? 'Сохраняем…' : 'Сохранить название'}
          </Button>
          {saved && <Saved />}
        </div>
        {renameOrg.isError && (
          <p role="alert" className="mt-1.5 text-sm text-[var(--danger)]">
            {(renameOrg.error as Error).message}
          </p>
        )}
      </div>
    </section>
  );
}

export function MyProfile() {
  const { data } = useOrgProfile();
  const { renameMe } = useOrgMutations();
  const [userName, setUserName] = useState('');
  const { saved, show } = useSavedFlag();

  useEffect(() => {
    if (data) setUserName(data.userName);
  }, [data]);

  const changed = data ? userName.trim() !== data.userName : false;

  return (
    <section>
      <h2 className="flex items-center gap-2 font-serif text-xl">
        <UserRound size={18} className="text-[var(--accent)]" />
        Профиль
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Имя видят только коллеги внутри кабинета — оно стоит в журнале действий рядом
        с тем, что вы сделали.
      </p>

      <div className="mt-4 max-w-md rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
        <Label>Ваше имя</Label>
        <Input
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          maxLength={200}
          placeholder="Мария Новикова"
        />
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          Ваш адрес входа: {data?.email ?? '—'}. Его сменить нельзя — по нему вы входите.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <Button
            size="sm"
            variant="primary"
            disabled={!changed || renameMe.isPending}
            onClick={() => renameMe.mutate(userName, { onSuccess: show })}
          >
            {renameMe.isPending ? 'Сохраняем…' : 'Сохранить имя'}
          </Button>
          {saved && <Saved />}
        </div>
      </div>
    </section>
  );
}
