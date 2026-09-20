import type { ReactNode } from 'react';
import { Brand } from '../shell/Brand';
import { Card } from '../ui/Card';

/**
 * Каркас страниц входа: знак и слово сверху, одна карточка по центру.
 *
 * Один на вход, регистрацию, подтверждение почты, забытый и новый пароль,
 * приглашение — раньше у каждой была своя обёртка `grid h-full
 * place-items-center`, свои отступы и свой размер карточки, и мелкие
 * расхождения копились без причины.
 */
export function AuthLayout({
  title,
  subtitle,
  icon,
  wide = false,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Замена знаку бренда — для экрана результата (галочка, предупреждение). */
  icon?: ReactNode;
  /** Чуть шире обычного — для формы с двумя колонками. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className={wide ? 'w-full max-w-md' : 'w-full max-w-sm'}>
        <div className="mb-8 flex items-center gap-3">
          {icon ?? <Brand size={44} />}
          {title !== undefined && (
            <div>
              <h1 className="text-2xl leading-tight font-semibold">{title}</h1>
              {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Экран результата без формы: знак заменён значком-иконкой, всё по центру. */
export function AuthResult({
  icon,
  title,
  children,
  footer,
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-sheet bg-accent-soft text-accent">
          {icon}
        </span>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children && <div className="mt-3 text-sm leading-relaxed text-muted">{children}</div>}
        {footer && <div className="mt-8">{footer}</div>}
      </div>
    </div>
  );
}

/** Карточка формы — одна и та же волосяная рамка на всех страницах входа. */
export function AuthCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Card className={`space-y-5 p-7 ${className}`}>{children}</Card>;
}
