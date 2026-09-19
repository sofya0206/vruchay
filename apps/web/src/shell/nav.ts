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
 * Пять пунктов колонки разделов — пять работ, ради которых сюда приходят.
 *
 * Не карта разделов: настройки и справка стоят в колонке отдельно, внизу,
 * аналитика и счета — в меню учётной записи.
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
      { to: '/documents/templates', label: 'Шаблоны' },
      { to: '/documents/archive', label: 'Архив' },
    ],
  },
  {
    key: 'mail',
    label: 'Письма',
    to: '/mailing',
    icon: Mail,
    children: [
      ...LETTER_LISTS.map((l) => ({
        to: l.id === 'all' ? '/mailing' : `/mailing?list=${l.id}`,
        label: l.label,
      })),
      { to: '/mailing?list=stats', label: 'Сводка' },
    ],
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
    children: INTEGRATION_SECTIONS.map((s) => ({
      to: `/integrations/${s.path}`,
      label: s.title,
    })),
  },
  {
    key: 'billing',
    label: 'Оплата',
    to: '/billing',
    icon: CreditCard,
    children: [],
  },
];

/**
 * Какой пункт колонки подсвечен.
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
