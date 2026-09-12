import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCheck, Clock, Mail, Plus, Users, X, type LucideIcon } from 'lucide-react';
import { ColumnList, ColumnRow, SectionLayout } from '../ui/SectionLayout';
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
  delivered: CheckCheck,
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
  delivered: 'text-[var(--accent)]',
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
      <ColumnList>
        {LETTER_LISTS.map((item) => (
          <ColumnRow
            key={item.id}
            to={mailListPath(item.id)}
            icon={ICONS[item.id]}
            active={current === item.id}
            count={listCount(item.id, counts)}
            tint={TINTS[item.id]}
          >
            {item.label}
          </ColumnRow>
        ))}
      </ColumnList>
      {/* Волосяная линия вместо подписи группы: письма и списки
          получателей — разная работа, но подписывать их отдельно значит
          занять две строки колонки ради двух слов. */}
      <ColumnList className="md:mt-2 md:border-t md:border-[var(--line)] md:pt-2">
        <ColumnRow
          to={mailListPath('lists')}
          icon={ICONS.lists}
          active={current === 'lists'}
        >
          Списки получателей
        </ColumnRow>
      </ColumnList>
    </nav>
  );
}

/**
 * Рама писем — общая `SectionLayout` с колонкой папок.
 * «Новая рассылка» — одна кнопка: в колонке на широком экране, в панели —
 * только на телефоне.
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
    <SectionLayout
      column={
        <>
          <div className="hidden md:block">
            <NewMailingLink className="w-full" />
          </div>
          <MailNav counts={counts} />
        </>
      }
      head={head}
      tools={
        <>
          {tools}
          <NewMailingLink className="md:hidden" />
        </>
      }
      bar={bar}
    >
      {children}
    </SectionLayout>
  );
}
