import { FileText, Mail, ShieldCheck, type LucideIcon } from 'lucide-react';

export interface NavChild {
  to: string;
  label: string;
}

export interface NavItem {
  key: 'documents' | 'mail' | 'registry';
  label: string;
  /** Куда ведёт сам пункт, без раскрытия. */
  to: string;
  icon: LucideIcon;
  /** Подстраницы в бургере на телефоне. */
  children: NavChild[];
}

/*
 * Три пункта колонки разделов — три работы, ради которых сюда приходят:
 * собрать документ, разослать письма, найти выданное.
 *
 * Не карта разделов: настройки и помощь стоят в колонке отдельно, внизу;
 * оплата и интеграции — настройки организации, а не работа, и живут
 * в настройках. Раньше «Оплата» стояла в меню и в настройках сразу,
 * а из пяти «Интеграций» работала одна.
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
      { to: '/mailing', label: 'Все письма' },
      { to: '/mailing/stats', label: 'Сводка' },
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
];

/**
 * Какой пункт колонки подсвечен.
 *
 * Все шаги документа — «Документы»: документ один, где бы человек внутри
 * него ни стоял. Журнал писем и сводка — «Письма». Аналитика — под
 * «Реестром»: она про выданное.
 */
export function activeNav(pathname: string): NavItem['key'] | null {
  if (pathname.startsWith('/documents')) return 'documents';
  if (pathname.startsWith('/mailing')) return 'mail';
  if (pathname.startsWith('/registry') || pathname.startsWith('/analytics')) return 'registry';
  return null;
}
