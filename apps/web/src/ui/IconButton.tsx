import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { cn } from './cn';

/**
 * Кнопка из одного значка — тонкая надстройка над `Button iconOnly`.
 *
 * Доступное имя обязательно — оно же подсказка. 44 точки на тач-экране,
 * 40 на десктопе: ниже — в палец не попасть. Браузерную подсказку не
 * пропускаем дальше, даже если её передали снаружи: две подсказки на
 * одной кнопке — это и есть та системная плашка, от которой уходим.
 */
export function IconButton({
  label,
  active,
  size = 'md',
  variant = 'ghost',
  className = '',
  children,
  title: _ignored,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <Button
      iconOnly
      label={label}
      active={active}
      size={size}
      variant={variant}
      className={cn(size === 'md' && 'pointer-coarse:size-11', className)}
      {...rest}
    >
      {children}
    </Button>
  );
}
