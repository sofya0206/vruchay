import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Mail, Plus, type LucideIcon } from 'lucide-react';
import { protocolTitle } from './format';
import { useCreateMaterial } from './useCreateMaterial';
import { CreateVisual, LibraryVisual, MailVisual } from './visuals';

/**
 * «Мои документы» — три двери, за которыми вся работа.
 *
 * Каждая плитка показывает, что внутри, картинкой: лист с подставляемым
 * именем, полка готовых бланков, журнал писем. Подпись под картинкой
 * объясняет ровно одну строку — остальное человек уже увидел.
 *
 * Номера у названий не украшение: это порядок, в котором работу делают
 * впервые. Собрал документ → нашёл его среди своих → разослал.
 */
export function QuickActions() {
  /*
   * «Создать документ» заводит материал и открывает лист — то же, что
   * делает «Редактор» в шапке. Ссылкой на список эта плитка вела туда же,
   * куда соседняя «Документы и шаблоны», и первая дверь открывалась
   * в ту же комнату, что вторая.
   */
  const create = useCreateMaterial();

  return (
    <section>
      <GroupTitle>Мои документы</GroupTitle>
      {/* Три плитки в одной рамке, а не три отдельные карточки: это один
          путь из трёх шагов, и разрезать его на три коробки значит
          показать три несвязанных предложения. */}
      <ul className="grid overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] shadow-[var(--ring-line)] sm:grid-cols-3">
        <BigTile
          icon={Plus}
          num="1"
          title="Создать документ"
          about="Соберите ваш документ, добавьте выгрузку данных из ваших протоколов участников"
          visual={<CreateVisual />}
          onClick={() => create.mutate(protocolTitle())}
          disabled={create.isPending}
        />
        <BigTile
          to="/documents"
          icon={FileText}
          num="2"
          title="Документы и шаблоны"
          about="Ваши рабочие макеты, архив и шаблоны"
          visual={<LibraryVisual />}
        />
        <BigTile
          to="/mailing"
          icon={Mail}
          num="3"
          title="Письма"
          about="Отправьте письма по загруженному списку и отслеживайте статус письма"
          visual={<MailVisual />}
        />
      </ul>

      {create.isError && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          Не удалось создать документ. Попробуйте ещё раз или начните с «Документов и шаблонов».
        </p>
      )}
    </section>
  );
}

/** Подпись группы: та же на «Моих документах» и на разделах ниже. */
export function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[length:var(--text-caption)] font-medium tracking-[.06em] text-[var(--text-muted)] uppercase">
      {children}
    </h2>
  );
}

function BigTile({
  to,
  onClick,
  disabled,
  icon: Icon,
  num,
  title,
  about,
  visual,
}: {
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  icon: LucideIcon;
  num: string;
  title: string;
  about: string;
  visual: ReactNode;
}) {
  const look =
    'flex h-full w-full flex-col items-start gap-4 p-4 text-left text-[var(--text)] ' +
    'transition-colors hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-60';

  const inside = (
    <>
      <span className="grid h-[236px] w-full place-items-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-sunken)] p-3.5">
        {visual}
      </span>
      <span className="flex w-full items-center gap-2.5 px-1">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon size={16} />
        </span>
        <span className="text-[17px] font-medium">{title}</span>
        <span className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full text-[length:var(--text-caption)] font-medium tabular-nums text-[var(--text-muted)] shadow-[inset_0_0_0_1px_var(--line)]">
          {num}
        </span>
      </span>
      <span className="px-1 pb-1 text-sm text-[var(--text-muted)]">{about}</span>
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
