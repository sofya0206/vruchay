import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, CheckCheck, Clock, Mail, Plus, Users, X, type LucideIcon } from 'lucide-react';
import type { MailingLog } from './api';
import { LETTER_LISTS, listCount, mailList, mailListPath, type MailList } from './mail-lists';

/**
 * Рамка раздела «Письма»: колонка папок слева, панель сверху, строка
 * состояния снизу.
 *
 * Устроено как почтовая программа, а не как страница с закладками: слева
 * состояния писем, справа сами письма. Закладки над списком отвечали
 * только на вопрос «где я», а на главный вопрос раздела — «дошло ли» —
 * приходилось отвечать выпадающим списком где-то внутри журнала.
 *
 * Рамка та же, что у «Документов»: колонка 60, панель под шапкой кабинета,
 * строка состояния внизу. Два раздела, устроенные одинаково, человек
 * осваивает один раз.
 */
const ICONS: Record<MailList, LucideIcon> = {
  all: Mail,
  queued: Clock,
  sent: Check,
  delivered: CheckCheck,
  opened: CheckCheck,
  undelivered: X,
  lists: Users,
  new: Plus,
};

/**
 * Цвет значка папки. Прочитанное и недоставленное подкрашены — это две
 * строки, ради которых в раздел заходят: одна говорит, что награждение
 * дошло, вторая — что часть писем надо разбирать руками.
 */
const TINTS: Partial<Record<MailList, string>> = {
  opened: 'text-[var(--accent)]',
  undelivered: 'text-[var(--danger)]',
};

/**
 * Новая рассылка — ссылка, а не кнопка с состоянием.
 *
 * Стоит в двух местах сразу: в колонке слева и в правом углу панели.
 * Обе ведут в один адрес `/mailing?list=new`, поэтому рассылка открывается
 * из любой папки и по прямой ссылке, а страница не хранит отдельного
 * «открыт ли мастер» — это решает адрес.
 */
function NewMailingLink({ className = '' }: { className?: string }) {
  return (
    <Link
      to={mailListPath('new')}
      className={
        'inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 ' +
        'text-sm font-medium whitespace-nowrap text-[var(--accent-contrast)] transition-colors ' +
        `hover:bg-[var(--accent-hover)] ${className}`
      }
    >
      <Plus size={16} />
      Новая рассылка
    </Link>
  );
}

export function MailNav({ counts }: { counts: MailingLog['summary'] }) {
  const [params] = useSearchParams();
  const current = mailList(params.get('list'));

  return (
    <nav aria-label="Папки писем" className="mt-3">
      {/* На узком экране колонка заняла бы две трети экрана телефона,
          поэтому там это лента, которая прокручивается вбок. */}
      <div className="flex gap-1 overflow-x-auto md:block md:overflow-visible">
        <ul className="flex gap-1 md:flex-col">
          {LETTER_LISTS.map((item) => (
            <Row
              key={item.id}
              id={item.id}
              label={item.label}
              active={current === item.id}
              count={listCount(item.id, counts)}
            />
          ))}
        </ul>

        {/* Волосяная линия вместо подписи группы: письма и списки
            получателей — разная работа, но подписывать их отдельно значит
            занять две строки колонки ради двух слов. */}
        <ul className="flex gap-1 md:mt-2 md:flex-col md:border-t md:border-[var(--line)] md:pt-2">
          <Row id="lists" label="Списки получателей" active={current === 'lists'} />
        </ul>
      </div>
    </nav>
  );
}

function Row({
  id,
  label,
  active,
  count,
}: {
  id: MailList;
  label: string;
  active: boolean;
  /** Сколько писем внутри. Ноль не рисуем — пустое место честнее нуля. */
  count?: number;
}) {
  const Icon = ICONS[id];

  return (
    <li>
      <Link
        to={mailListPath(id)}
        aria-current={active ? 'page' : undefined}
        className={
          'flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-sm whitespace-nowrap ' +
          'transition-colors ' +
          (active
            ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
            : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]')
        }
      >
        <Icon
          size={16}
          strokeWidth={1.75}
          className={`shrink-0 ${active ? '' : (TINTS[id] ?? '')}`}
        />
        <span className="md:flex-1 md:truncate">{label}</span>
        {count ? <span className="tabular text-xs text-[var(--text-muted)]">{count}</span> : null}
      </Link>
    </li>
  );
}

/**
 * Общая рамка раздела.
 *
 * `head` — левая часть верхней панели (название папки), `tools` — то,
 * что стоит перед кнопкой рассылки (обновить и поиск), `bar` — нижняя
 * строка состояния. Кнопку рассылки рамка рисует сама: она обязана
 * стоять на одном месте во всех папках раздела.
 */
export function MailLayout({
  counts,
  head,
  tools,
  bar,
  children,
}: {
  counts: MailingLog['summary'];
  head: ReactNode;
  tools?: ReactNode;
  bar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="border-b border-[var(--line)] md:w-60 md:shrink-0 md:border-r md:border-b-0">
        {/* --app-header — высота шапки кабинета вместе с её линией. Колонка
            встаёт ровно под шапку и дальше стоит на месте, пока список
            прокручивается. Числом высоту не пишем: шапку правят, и колонка
            должна ехать за ней. */}
        <div className="p-3 md:sticky md:top-[var(--app-header)] md:max-h-[calc(100vh-var(--app-header))] md:overflow-y-auto">
          {/* На телефоне колонка стоит над панелью, и две кнопки рассылки
              оказались бы подряд одна под другой — здесь остаётся та,
              что в панели. */}
          <div className="hidden md:block">
            <NewMailingLink className="w-full" />
          </div>
          <MailNav counts={counts} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="z-10 flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-6 py-3 md:sticky md:top-[var(--app-header)]">
          <div className="min-w-0 flex-1">{head}</div>
          {tools}
          <NewMailingLink />
        </div>

        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>

        {bar && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-[var(--surface)] px-6 py-2.5 text-sm">
            {bar}
          </div>
        )}
      </div>
    </div>
  );
}
