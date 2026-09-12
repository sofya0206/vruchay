import { useEffect, useState } from 'react';
import { ColorPicker } from '../ui/ColorPicker';
import { normalizeHex } from '../ui/color';

/**
 * Цвет: образец с палитрой плюс поле для кода.
 *
 * Поле обязательно. У организаций есть фирменные цвета, которые приходят
 * в виде «#1F5D3F» из брендбука или с сайта, и подбирать такой оттенок
 * мышью в радуге невозможно.
 *
 * Пока человек печатает, наверх уходят только законченные значения: иначе
 * промежуточное «#1F» превращало бы текст в чёрный на каждом нажатии,
 * и допечатать код было бы нельзя.
 */
export function ColorField({
  value,
  onChange,
  disabled = false,
  label = 'Цвет',
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [text, setText] = useState(value);

  // Цвет мог поменяться снаружи — выбором другого блока или отменой действия.
  useEffect(() => setText(value), [value]);

  function apply(raw: string) {
    setText(raw);
    const normalized = normalizeHex(raw);
    if (normalized) onChange(normalized);
  }

  return (
    <div className="flex gap-1.5">
      <ColorPicker value={value} onChange={onChange} disabled={disabled} label={label} />
      <input
        type="text"
        value={text}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) => apply(e.target.value)}
        // Ушли из поля с недописанным кодом — возвращаем действующий цвет,
        // чтобы в поле не осталось значение, которого нет на листе.
        onBlur={() => setText(value)}
        placeholder="#1F5D3F"
        aria-label={`${label}: код`}
        className="h-[38px] w-full min-w-0 rounded-lg bg-[var(--surface)] px-2 font-mono text-sm uppercase ring-1 ring-[var(--line-strong)] focus:ring-2 focus:ring-[var(--focus)] focus:outline-none disabled:opacity-40"
      />
    </div>
  );
}
