import { useLocation } from 'react-router-dom';
import {
  BookOpen,
  CircleHelp,
  Gift,
  GraduationCap,
  LifeBuoy,
  Map,
  MessageSquareQuote,
} from 'lucide-react';
import { Menu, MenuDivider, MenuItem } from '../ui/Menu';
import { useTooltip } from '../ui/Tooltip';
import { cn } from '../ui/cn';
import { onboarding } from '../onboarding/store';

const HELP_PATHS = ['/docs', '/support', '/referral'];

/**
 * «Помощь» внизу колонки разделов: одно меню вместо трёх пунктов.
 *
 * База знаний, обучение, поддержка с дорожной картой и отзывом,
 * приглашение друга — всё, что не работа и не настройка. Так устроено
 * в Linear и Notion: «?» в углу, а под ним всё, куда ходят за помощью.
 */
export function HelpMenu({ collapsed }: { collapsed: boolean }) {
  const { pathname } = useLocation();
  const active = HELP_PATHS.some((p) => pathname.startsWith(p));
  const tip = useTooltip(collapsed ? 'Помощь' : undefined, { placement: 'right' });

  return (
    <Menu
      side="top"
      align="left"
      title="Помощь"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={collapsed ? 'Помощь' : undefined}
          {...tip.triggerProps}
          onClick={toggle}
          className={cn(
            'flex h-11 w-full items-center gap-3 rounded-xl text-base transition-colors',
            collapsed ? 'justify-center' : 'px-3',
            active || open
              ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
              : 'text-[var(--text)] hover:bg-[var(--surface-sunken)]',
          )}
        >
          <CircleHelp size={20} strokeWidth={1.75} className="shrink-0" />
          {!collapsed && <span className="truncate">Помощь</span>}
          {tip.tooltip}
        </button>
      )}
    >
      <MenuItem to="/docs" icon={<BookOpen size={17} strokeWidth={1.75} />}>
        База знаний
      </MenuItem>
      <MenuItem onClick={() => onboarding.open()} icon={<GraduationCap size={17} strokeWidth={1.75} />}>
        Обучение
      </MenuItem>
      <MenuDivider />
      <MenuItem to="/support" icon={<LifeBuoy size={17} strokeWidth={1.75} />}>
        Написать в поддержку
      </MenuItem>
      <MenuItem to="/support#roadmap" icon={<Map size={17} strokeWidth={1.75} />}>
        Что дальше
      </MenuItem>
      <MenuItem to="/support#review" icon={<MessageSquareQuote size={17} strokeWidth={1.75} />}>
        Оценить сервис
      </MenuItem>
      <MenuDivider />
      <MenuItem to="/referral" icon={<Gift size={17} strokeWidth={1.75} />}>
        Пригласить друга
      </MenuItem>
    </Menu>
  );
}
