import {
  CreditCard,
  FileText,
  Mail,
  Plug,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { LETTER_LISTS } from '../mailing/mail-lists';
import { INTEGRATION_SECTIONS } from '../integrations/sections';

export interface NavChild {
  to: string;
  label: string;
}

export interface NavItem {
  key: 'documents' | 'mail' | 'registry' | 'integrations' | 'billing';
  label: string;
  /** Куда ведёт сам пункт, без раскрытия. */
  to: string;
  icon: LucideIcon;
  /** Подстраницы в выпадающем. Папки документов добавляются на месте. */
  children: NavChild[];
}

/*
 * Пять пунктов верхней полосы — пять работ, ради которых сюда приходят.
 *
 * Не карта разделов: настройки, аналитика, счета и справка лежат в бургере.
 * Подстраницы берутся из тех же списков, что рисуют колонки внутри разделов
 * (папки писем, площадки интеграций), — иначе меню разошлось бы с разделом
 * при первой же правке.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    key: 'documents',
    label: 'Документы',
    to: '/documents',
    icon: FileText,
    children: [
      { to: '/documents', label: 'Мои документы' },
      { to: '/documents/archive', label: 'Архив' },
    ],
  },
  {
    key: 'mail',
    label: 'Письма',
    to: '/mailing',
    icon: Mail,
    children: LETTER_LISTS.map((l) => ({
      to: l.id === 'all' ? '/mailing' : `/mailing?list=${l.id}`,
      label: l.label,
    })),
  },
  {
    key: 'registry',
    label: 'Реестр',
    to: '/registry',
    icon: ShieldCheck,
    children: [
      { to: '/registry', label: 'Все выданные' },
      { to: '/registry?tab=analytics', label: 'Аналитика' },
    ],
  },
  {
    key: 'integrations',
    label: 'Интеграции',
    to: '/integrations',
    icon: Plug,
    children: INTEGRATION_SECTIONS.filter((s) => s.path !== 'info')
      .map((s) => ({ to: `/integrations/${s.path}`, label: s.title }))
      .concat({ to: '/integrations/info', label: 'Как это работает' }),
  },
  {
    key: 'billing',
    label: 'Оплата',
    to: '/billing',
    icon: CreditCard,
    children: [{ to: '/billing', label: 'Тариф и счета' }],
  },
];

/**
 * Какой пункт полосы подсвечен.
 *
 * Редактор материала и рабочее место письма — подстраницы «Документов»:
 * материал открывают из документов и туда же возвращаются. Аналитика
 * живёт под «Реестром»: она про выданное.
 */
export function activeNav(pathname: string): NavItem['key'] | null {
  if (pathname.startsWith('/documents') || pathname.startsWith('/mailing/')) return 'documents';
  if (pathname.startsWith('/mailing')) return 'mail';
  if (pathname.startsWith('/registry') || pathname.startsWith('/analytics')) return 'registry';
  if (pathname.startsWith('/integrations')) return 'integrations';
  if (pathname.startsWith('/billing')) return 'billing';
  return null;
}

/**
 * Куда ведёт стрелка под шапкой: на уровень выше, а не назад по истории.
 *
 * «Назад» через историю браузера уводило туда, откуда только что пришёл:
 * из материала — в письмо, из письма — обратно в материал, и человек
 * ходил кругами. Стрелка — это «выйти из того, где я»: из материала —
 * к документам, из вкладки аналитики — к реестру, из раздела — на главную.
 *
 * Строка запроса — уровень внутри раздела (отбор, вкладка), поэтому
 * сначала снимается она, потом последний сегмент пути.
 */
export function parentPath(pathname: string, search = ''): string {
  if (search && search !== '?') return pathname;
  const trimmed = pathname.replace(/\/+$/, '');
  const cut = trimmed.lastIndexOf('/');
  const parent = cut > 0 ? trimmed.slice(0, cut) : '/';
  // Корень плоского раздела перенаправляет на первую площадку или вкладку;
  // стрелка туда ходила бы по кругу. Из его подстраниц — сразу на главную.
  return FLAT_SECTIONS.has(parent) ? '/' : parent;
}

/**
 * Разделы, у которых корень — не экран, а редирект на первый пункт колонки
 * (`/integrations` → `/integrations/tilda`, `/settings` → `/settings/account`).
 * Держать в согласии с индексными маршрутами в App.tsx.
 */
const FLAT_SECTIONS = new Set(['/integrations', '/settings']);

const PARENT_TITLES: Record<string, string> = {
  '/': 'На главную',
  '/documents': 'К документам',
  '/mailing': 'К письмам',
  '/registry': 'К реестру',
  '/integrations': 'К интеграциям',
  '/settings': 'К настройкам',
  '/docs': 'К базе знаний',
};

/** Подпись стрелки — куда именно она ведёт. */
export function parentTitle(parent: string): string {
  return PARENT_TITLES[parent] ?? 'На уровень выше';
}
