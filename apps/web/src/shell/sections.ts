import {
  ChartNoAxesColumn,
  CreditCard,
  FileText,
  Mail,
  Plug,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export interface Section {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Одна строка: что здесь делают. Длиннее — уже статья, а не навигация. */
  about: string;
}

export interface SectionGroup {
  id: string;
  title: string;
  items: Section[];
}

/*
 * Разделы кабинета — единственный список, из которого рисуется главная.
 *
 * Раньше он же рисовался лентой в шапке, и получалось две навигации об одном:
 * человек выбирал раздел сверху, не понимая, чем «Реестр» отличается
 * от «Аналитики», — подписи там не помещались. Теперь разделы живут
 * на главной, где рядом с каждым есть строка объяснения.
 *
 * Работы с документами здесь нет: она стоит выше, в «Моих документах»,
 * тремя крупными плитками с картинками. Сюда попало то, что открывают
 * между делом, — поэтому строкой и без картинки.
 */
export const SECTION_GROUPS: SectionGroup[] = [
  {
    id: 'account',
    // Открыта всегда: оплату и подключения прятать нельзя — за ними
    // приходят редко, но когда приходят, искать их по раскрывающимся
    // блокам значит не найти вовсе.
    title: 'Подключение и оплата',
    items: [
      {
        path: '/integrations',
        label: 'Интеграции',
        icon: Plug,
        about: 'Форма на сайте, Тильда, API',
      },
      {
        path: '/billing',
        label: 'Оплата',
        icon: CreditCard,
        about: 'Тариф, счета, закрывающие',
      },
    ],
  },
  {
    id: 'control',
    title: 'Проверка',
    items: [
      {
        path: '/registry',
        label: 'Реестр',
        icon: ShieldCheck,
        about: 'Всё выданное, поиск по фамилии',
      },
      {
        path: '/analytics',
        label: 'Аналитика',
        icon: ChartNoAxesColumn,
        about: 'Проверки по QR и качество выпуска',
      },
    ],
  },
];

/**
 * Разделы, которых нет в плитках главной, но по адресу они узнаются.
 *
 * «Документы» открывают крупной плиткой «Мои документы» сверху — второй
 * строкой в списке разделов они стояли бы дважды. Но заглушке раздела
 * и разбору адреса название всё равно нужно.
 */
const OFF_LIST: Section[] = [
  {
    path: '/documents',
    label: 'Документы и шаблоны',
    icon: FileText,
    about: 'Рабочие, архив, шаблоны',
  },
  {
    path: '/mailing',
    label: 'Письма',
    icon: Mail,
    about: 'Списки получателей и письма',
  },
];

/** Плоский список — там, где группы не нужны (поиск раздела по адресу). */
export const SECTIONS: Section[] = [...SECTION_GROUPS.flatMap((group) => group.items), ...OFF_LIST];

/**
 * Какой раздел считать открытым.
 *
 * Совпадение по началу адреса, чтобы редактор материала (`/documents/:id`)
 * относился к «Документам», а не выглядел страницей вне разделов.
 * Главная сюда не входит: она больше не пункт навигации, а сама навигация.
 */
export function activeSection(pathname: string): string | null {
  if (pathname === '/') return null;

  const match = SECTIONS.filter((s) => pathname === s.path || pathname.startsWith(`${s.path}/`))
    // Самый длинный подходящий адрес: если однажды появятся вложенные
    // разделы, подсветится ближний, а не тот, что просто начинается так же.
    .sort((a, b) => b.path.length - a.path.length)[0];

  return match?.path ?? null;
}
