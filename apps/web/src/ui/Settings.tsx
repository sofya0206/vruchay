import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Единицы страницы настроек — одни на все разделы.
 *
 * Раньше каждая секция начиналась заголовком с синей иконкой, абзацем
 * подводки и карточкой, внутри которой лежали ещё карточки: «Профиль»
 * и «Удалить аккаунт» весили одинаково, а до контрола приходилось
 * дочитывать. Теперь секция — заголовок и строки под ним, разделённые
 * волосяной линией; строка — название, одно пояснение и контрол справа.
 * Так устроены настройки в Linear, Notion и GitHub, и глаз находит
 * нужное по левому краю, не читая.
 */

/** Стопка секций: между ними линия, а не пустота. */
export function SettingsStack({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line [&>*]:py-8 [&>*:first-child]:pt-0">{children}</div>;
}

/** Заголовок секции: название, одна строка пояснения, действие справа. */
export function SectionHead({
  title,
  about,
  action,
  className,
}: {
  title: ReactNode;
  about?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-medium">{title}</h2>
        {about && <p className="mt-0.5 max-w-2xl text-sm text-muted">{about}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Секция целиком: заголовок и содержимое с отступом. */
export function SettingsSection({
  title,
  about,
  action,
  children,
}: {
  title: ReactNode;
  about?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <SectionHead title={title} about={about} action={action} />
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Строки настроек, разделённые линией. */
export function SettingRows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y divide-line', className)}>{children}</div>;
}

/**
 * Строка настройки: название и пояснение слева, контрол справа.
 * На телефоне контрол встаёт под название во всю ширину.
 */
export function SettingRow({
  title,
  about,
  children,
  className,
}: {
  title: ReactNode;
  about?: ReactNode;
  /** Контрол: переключатель, поле, кнопка, чип. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-6 gap-y-2 py-3', className)}>
      <div className="min-w-[14rem] flex-1">
        <div className="text-sm font-medium">{title}</div>
        {about && <div className="text-sm text-muted">{about}</div>}
      </div>
      {children && <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * Опасная зона — последняя секция раздела. Красная рамка — единственная
 * рамка на странице, поэтому её видно ещё до чтения.
 */
export function DangerZone({
  title,
  about,
  action,
  children,
}: {
  title: ReactNode;
  about?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section>
      <div className="rounded-card p-4 ring-1 ring-danger/50">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium">{title}</h2>
            {about && <p className="text-sm text-muted">{about}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}
