import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { cn } from './cn';

/**
 * Кнопка из одного значка — тонкая надстройка над `Button iconOnly`.
 *
 * Доступное имя обязательно — оно же подсказка. 44 точки на тач-экране —
 * и у мелкого размера тоже: в панелях редактора и в строках таблицы он
 * оставался 32-точечным, и палец попадал в соседа. Браузерную подсказку
 * не пропускаем дальше, даже если её передали снаружи: две подсказки на
 * одной кнопке — это и есть та системная плашка, от которой уходим.
 *
 * Значок уходит в `icon`, а не в дети: `Button` с `iconOnly` детей не
 * рисует вовсе (их место — подпись, которой у кнопки-значка нет), и
 * каждая такая кнопка выходила пустым квадратом — бургер в шапке,
 * «Ещё действия», «Удалить строку» и весь ряд значков в редакторе.
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
      icon={children}
      label={label}
      active={active}
      size={size}
      variant={variant}
      className={cn('pointer-coarse:size-11', className)}
      {...rest}
    />
  );
}
