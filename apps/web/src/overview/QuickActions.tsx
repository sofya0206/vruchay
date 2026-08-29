import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FileUp, ListChecks, Plus } from 'lucide-react';
import type { Overview } from '../api/overview';
import { protocolTitle } from './format';
import { useCreateMaterial } from './useCreateMaterial';
import { workspacePath } from '../mailing/workspace-tabs';

/**
 * Три действия, ради которых сюда заходят.
 *
 * Каждое ведёт прямо к выпуску, а не в раздел, откуда до выпуска ещё
 * идти. Раньше от входа до списка участников было четыре нажатия
 * и одно из них — угадать, что список живёт внутри материала.
 */
export function QuickActions({ data }: { data: Overview }) {
  const create = useCreateMaterial();
  const latest = data.documents[0];

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-3">
        {/* Продолжить последнее: обычно человек возвращается к тому же
            награждению, что и вчера, — оно и стоит первым. */}
        <Action
          to={latest ? workspacePath(latest.id) : '/documents'}
          icon={<ListChecks size={18} />}
          title="Выпустить документы по списку"
          about={
            latest ? (
              <>Список участников материала «{latest.title}»: проверить и выпустить</>
            ) : (
              'Загрузить участников в материал и выпустить документы'
            )
          }
        />

        {/* Протокол — всегда новое соревнование, поэтому и материал новый:
            подложить свежий протокол в прошлое награждение значит смешать
            два списка участников в одном материале. */}
        <Action
          icon={<FileUp size={18} />}
          title="Загрузить протокол соревнований"
          about="Новый материал под соревнование: места и группы сервис распознает сам"
          onClick={() => create.mutate(protocolTitle())}
          disabled={create.isPending}
        />

        <Action
          to="/documents"
          icon={<Plus size={18} />}
          title="Создать материал"
          about="Свой бланк, поля и размер листа — с самого начала"
        />
      </ul>

      {create.isError && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          Не удалось создать материал. Попробуйте ещё раз или начните с раздела «Документы».
        </p>
      )}
    </>
  );
}

function Action({
  to,
  onClick,
  disabled,
  icon,
  title,
  about,
}: {
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  icon: ReactNode;
  title: string;
  about: ReactNode;
}) {
  const look =
    'flex h-full w-full flex-col items-start gap-2 rounded-2xl bg-[var(--surface)] p-4 text-left ' +
    'ring-1 ring-[var(--line)] transition-colors hover:bg-[var(--accent-soft)] ' +
    'hover:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60';

  const inside = (
    <>
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
        {icon}
      </span>
      <span className="font-medium">{title}</span>
      <span className="text-sm text-[var(--text-muted)]">{about}</span>
    </>
  );

  return (
    <li>
      {to ? (
        <Link to={to} className={look}>
          {inside}
        </Link>
      ) : (
        <button type="button" onClick={onClick} disabled={disabled} className={look}>
          {inside}
        </button>
      )}
    </li>
  );
}
