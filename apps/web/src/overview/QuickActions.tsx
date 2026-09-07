import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Mail, Plus } from 'lucide-react';
import type { Overview } from '../api/overview';
import { workspacePath } from '../mailing/workspace-tabs';

/**
 * Три действия, ради которых сюда заходят.
 *
 * Каждое ведёт прямо к работе, а не в раздел, откуда до неё ещё идти.
 * Раньше от входа до списка участников было четыре нажатия и одно
 * из них — угадать, что список живёт внутри материала.
 *
 * Блоков было четыре смысла на три плитки: «загрузить протокол» и «создать
 * материал» заводили один и тот же новый материал и отличались только
 * названием. Осталось создание одно, а освободившееся место занял вход
 * в рассылку — вторая половина дня награждения.
 */
export function QuickActions({ data }: { data: Overview }) {
  const latest = data.documents[0];

  return (
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

      <Action
        to="/mailing"
        icon={<Mail size={18} />}
        title="Разослать документы"
        about="Списки получателей и письма"
      />

      <Action
        to="/documents"
        icon={<Plus size={18} />}
        title="Создать материал"
        about="Свой бланк, поля и размер листа"
      />
    </ul>
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
    'flex h-full w-full flex-col items-start gap-3 rounded-2xl bg-[var(--surface)] p-6 text-left ' +
    'ring-1 ring-[var(--line)] transition-colors hover:bg-[var(--accent-soft)] ' +
    'hover:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60';

  const inside = (
    <>
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
        {icon}
      </span>
      {/* Подпись прижата к низу плитки: у трёх действий текст разной длины,
          и без этого заголовки стояли на разной высоте. */}
      <span className="mt-auto text-lg font-medium">{title}</span>
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
