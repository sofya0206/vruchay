import { useEffect, useState } from 'react';
import { Building2, Check } from 'lucide-react';
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
 */
export function Organization() {
  const { data } = useOrgProfile();
  const { renameOrg, renameMe } = useOrgMutations();
  const [orgName, setOrgName] = useState('');
  const [userName, setUserName] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (!data) return;
    setOrgName(data.orgName);
    setUserName(data.userName);
  }, [data]);

  const orgChanged = data ? orgName.trim() !== data.orgName && orgName.trim().length >= 2 : false;
  const meChanged = data ? userName.trim() !== data.userName : false;

  function done(what: string) {
    setSaved(what);
    setTimeout(() => setSaved(''), 4000);
  }

  return (
    <section>
      <h2 className="flex items-center gap-2 font-serif text-xl">
        <Building2 size={18} className="text-[var(--accent)]" />
        Организация и вы
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Название организации участники увидят в письме — в поле «от кого». Ваше имя видят
        только коллеги внутри кабинета.
      </p>

      <div className="mt-4 max-w-md space-y-4 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
        <div>
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
              disabled={!orgChanged || renameOrg.isPending}
              onClick={() => renameOrg.mutate(orgName, { onSuccess: () => done('org') })}
            >
              {renameOrg.isPending ? 'Сохраняем…' : 'Сохранить название'}
            </Button>
            {saved === 'org' && (
              <span className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
                <Check size={15} /> Сохранено
              </span>
            )}
          </div>
          {renameOrg.isError && (
            <p role="alert" className="mt-1.5 text-sm text-[var(--danger)]">
              {(renameOrg.error as Error).message}
            </p>
          )}
        </div>

        <hr className="border-[var(--line)]" />

        <div>
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
              disabled={!meChanged || renameMe.isPending}
              onClick={() => renameMe.mutate(userName, { onSuccess: () => done('me') })}
            >
              {renameMe.isPending ? 'Сохраняем…' : 'Сохранить имя'}
            </Button>
            {saved === 'me' && (
              <span className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
                <Check size={15} /> Сохранено
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
