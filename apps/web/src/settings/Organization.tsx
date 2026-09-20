import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { errorText } from '../api/client';
import { useOrgProfile, useOrgMutations } from '../api/org';
import { Button } from '../ui/Button';
import { Input, StatusChip } from '../ui/Field';
import { SettingRow, SettingRows, SettingsSection } from '../ui/Settings';

/**
 * Название организации и своё имя.
 *
 * Оба задавались один раз при регистрации и застревали навсегда,
 * а название стоит в имени отправителя писем участникам, в приглашении
 * друга и на витрине отзывов. Опечатка расходилась по всем трём местам
 * без всякой возможности её исправить.
 *
 * Имя человека живёт в разделе «Аккаунт» рядом с паролем и вторым
 * фактором, название организации — в «Организации» рядом с оплатой.
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
    <span className="flex items-center gap-1.5 text-sm text-ok">
      <Check size={15} /> Сохранено
    </span>
  );
}

/** Поле с кнопкой: кнопка серая, пока значение не изменилось. */
function NameRow({
  title,
  about,
  value,
  initial,
  min = 1,
  maxLength,
  placeholder,
  pending,
  error,
  onChange,
  onSave,
  saved,
}: {
  title: string;
  about: string;
  value: string;
  initial: string | undefined;
  min?: number;
  maxLength: number;
  placeholder: string;
  pending: boolean;
  error: unknown;
  onChange: (v: string) => void;
  onSave: () => void;
  saved: boolean;
}) {
  const changed = initial !== undefined && value.trim() !== initial && value.trim().length >= min;
  return (
    <SettingRow
      title={title}
      about={error ? <span className="text-danger">{errorText(error)}</span> : about}
    >
      {saved && <Saved />}
      <form
        className="flex items-center gap-2 max-sm:w-full"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) onSave();
        }}
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={title}
          className="w-64 py-1.5 text-sm max-sm:w-full"
        />
        <Button
          type="submit"
          size="sm"
          variant={changed ? 'primary' : 'secondary'}
          disabled={!changed || pending}
        >
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </form>
    </SettingRow>
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

  return (
    <SettingsSection title="Организация">
      <SettingRows>
        <NameRow
          title="Название"
          about="В письмах участникам и на странице проверки документа"
          value={orgName}
          initial={data?.orgName}
          min={2}
          maxLength={200}
          placeholder="Центр «Развитие»"
          pending={renameOrg.isPending}
          error={renameOrg.isError ? renameOrg.error : null}
          onChange={setOrgName}
          onSave={() => renameOrg.mutate(orgName, { onSuccess: show })}
          saved={saved}
        />
      </SettingRows>
    </SettingsSection>
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

  return (
    <SettingsSection title="Профиль">
      <SettingRows>
        <NameRow
          title="Имя"
          about="Видят коллеги в журнале действий"
          value={userName}
          initial={data?.userName}
          maxLength={200}
          placeholder="Мария Новикова"
          pending={renameMe.isPending}
          error={renameMe.isError ? renameMe.error : null}
          onChange={setUserName}
          onSave={() => renameMe.mutate(userName, { onSuccess: show })}
          saved={saved}
        />
        <SettingRow title="Почта для входа" about={data?.email ?? '—'}>
          <StatusChip tone="neutral">не меняется</StatusChip>
        </SettingRow>
      </SettingRows>
    </SettingsSection>
  );
}
