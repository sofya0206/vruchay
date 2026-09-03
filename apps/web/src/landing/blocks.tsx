import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/Button';

/**
 * Строительные блоки отраслевых посадочных.
 *
 * Шесть страниц для шести покупателей сложены из одних и тех же кусков:
 * заход, сетка доводов, список фактов, шаги, финальный призыв. Разница
 * между страницами — в текстах, а не в вёрстке; вёрстка одна, чтобы
 * с главной на отраслевую страницу человек переходил, не замечая шва.
 *
 * Правило текстов то же, что на главной: каждая строка несёт число или
 * проверяемый факт. Блоки этого не проверяют — за это отвечает автор.
 */

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

interface Cta {
  to: string;
  label: string;
}

interface HeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead: ReactNode;
  primary: Cta;
  secondary?: Cta;
  note?: ReactNode;
  /** Правая колонка: пример документа, список, что угодно. */
  aside?: ReactNode;
}

export function LandingHero({ eyebrow, title, lead, primary, secondary, note, aside }: HeroProps) {
  return (
    <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-20">
      <div className={`grid items-center gap-12 ${aside ? 'lg:grid-cols-[1.1fr_1fr]' : ''}`}>
        <div className="vru-enter">
          {eyebrow && (
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
              {eyebrow}
            </p>
          )}
          <h1 className="max-w-2xl font-serif text-4xl leading-[1.1] sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">{lead}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <CtaLink cta={primary} variant="primary" />
            {secondary && <CtaLink cta={secondary} variant="secondary" />}
          </div>
          {note && <p className="mt-4 text-sm text-[var(--text-muted)]">{note}</p>}
        </div>
        {aside}
      </div>
    </section>
  );
}

/** Якорь на этой же странице — обычная ссылка, путь — через маршрутизатор. */
function CtaLink({ cta, variant }: { cta: Cta; variant: 'primary' | 'secondary' }) {
  const button = <Button variant={variant}>{cta.label}</Button>;
  return cta.to.startsWith('#') ? <a href={cta.to}>{button}</a> : <Link to={cta.to}>{button}</Link>;
}

interface SectionProps {
  id?: string;
  title: ReactNode;
  lead?: ReactNode;
  /** «surface» — подложка с рамками сверху и снизу, чередуется с фоном страницы. */
  tone?: 'plain' | 'surface';
  narrow?: boolean;
  children: ReactNode;
}

export function Section({ id, title, lead, tone = 'plain', narrow, children }: SectionProps) {
  const inner = (
    <div className={`mx-auto ${narrow ? 'max-w-3xl' : 'max-w-5xl'} px-6 py-16`}>
      <h2 className="font-serif text-3xl">{title}</h2>
      {lead && <p className="mt-2 max-w-2xl text-[var(--text-muted)]">{lead}</p>}
      {children}
    </div>
  );
  return tone === 'surface' ? (
    <section id={id} className="scroll-mt-16 border-y border-[var(--line)] bg-[var(--surface)]">
      {inner}
    </section>
  ) : (
    <section id={id} className="scroll-mt-16">
      {inner}
    </section>
  );
}

export interface Argument {
  icon?: Icon;
  title: string;
  text: ReactNode;
}

/** Довод с иконкой слева: как «Чем отличается» на главной. */
export function ArgumentGrid({ items, columns = 2 }: { items: Argument[]; columns?: 2 | 3 }) {
  return (
    <div
      className={`mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 ${columns === 3 ? 'lg:grid-cols-3' : ''}`}
    >
      {items.map((item) => (
        <div key={item.title} className="flex gap-4">
          {item.icon && (
            <span className="mt-0.5 shrink-0 text-[var(--accent)]">
              <item.icon size={20} strokeWidth={1.75} />
            </span>
          )}
          <div>
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{item.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Список с галочками: короткие проверяемые утверждения. */
export function FactList({ items, className = '' }: { items: ReactNode[]; className?: string }) {
  return (
    <ul className={`space-y-4 ${className}`}>
      {items.map((line, i) => (
        <li key={i} className="flex gap-3">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
          <span className="text-sm leading-relaxed">{line}</span>
        </li>
      ))}
    </ul>
  );
}

export interface Step {
  icon?: Icon;
  title: string;
  text: ReactNode;
}

export function Steps({ items }: { items: Step[] }) {
  return (
    <ol className="mt-10 grid gap-8 sm:grid-cols-3">
      {items.map((step, n) => (
        <li key={step.title}>
          {step.icon && (
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <step.icon size={19} strokeWidth={1.75} />
            </span>
          )}
          <h3 className="mt-4 font-medium">
            <span className="mr-2 text-[var(--text-muted)]">{n + 1}.</span>
            {step.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{step.text}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Таблица «термин — что это значит». Юридические и закупочные страницы
 * без неё превращаются в стену абзацев, а читатель ищет в ней одно слово.
 */
export function Definitions({ items }: { items: { term: string; text: ReactNode }[] }) {
  return (
    <dl className="mt-10 divide-y divide-[var(--line)] rounded-xl bg-[var(--surface)] ring-1 ring-[var(--line)]">
      {items.map((d) => (
        <div key={d.term} className="grid gap-2 px-6 py-5 sm:grid-cols-[220px_1fr] sm:gap-6">
          <dt className="font-medium">{d.term}</dt>
          <dd className="text-sm leading-relaxed text-[var(--text-muted)]">{d.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Крупная цифра с подписью: цена, срок, лимит. */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] p-5 ring-1 ring-[var(--line)]">
      <p className="font-serif text-3xl">{value}</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

interface FinalCtaProps {
  title: ReactNode;
  text: ReactNode;
  primary: Cta;
  secondary?: Cta;
}

export function FinalCta({ title, text, primary, secondary }: FinalCtaProps) {
  return (
    <section className="border-t border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h2 className="font-serif text-3xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-md text-[var(--text-muted)]">{text}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <CtaLink cta={primary} variant="primary" />
          {secondary && <CtaLink cta={secondary} variant="secondary" />}
        </div>
      </div>
    </section>
  );
}

/**
 * Форма запроса без бэкенда: письмо на адрес продаж с подставленной темой.
 * Организации пишут с корпоративной почты и присылают реквизиты — это
 * удобнее для них, чем поле формы, и не требует нового эндпоинта.
 */
export function ContactBlock({
  title,
  text,
  subject,
}: {
  title: string;
  text: ReactNode;
  subject: string;
}) {
  const email = import.meta.env.VITE_OPERATOR_EMAIL ?? 'hello@vruchay.ru';
  const href = `mailto:${email}?subject=${encodeURIComponent(subject)}`;
  return (
    <div className="mt-10 flex flex-wrap items-center gap-4 rounded-xl bg-[var(--surface-sunken)] p-6">
      <div className="min-w-64 flex-1">
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{text}</p>
      </div>
      <a href={href}>
        <Button variant="primary">Написать: {email}</Button>
      </a>
    </div>
  );
}
