import type { HintId } from '@gramota/shared';
import { onboarding, useOnboarding } from './store';

/**
 * Пульсирующая точка у места первого столкновения.
 *
 * Нажали на точку — карточка в одну строку. Открыли то, на что она
 * указывает, — точка гаснет сама (экран зовёт `onboarding.markSeen`).
 * Не кнопка, а span с ролью: точка живёт внутри вкладок и подписей,
 * а кнопка внутри кнопки — невалидная разметка.
 */
export function Hotspot({ id }: { id: HintId }) {
  const s = useOnboarding();
  if (s.seen.includes(id)) return null;
  const open = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onboarding.showHint(id);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Подсказка"
      data-hint={id}
      onClick={open}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open(e)}
      className="vru-hotspot ml-1.5 inline-block size-2.5 shrink-0 cursor-pointer rounded-full bg-[var(--accent)] align-middle"
    />
  );
}
