import {
  ChartNoAxesColumn,
  CreditCard,
  FileText,
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
 * на главной, где рядом с каждым есть строка объяснения и живая цифра,
 * а шапка сведена к возврату на главную и к редактору.
 *
 * Группы — не украшение: три вопроса, с которыми сюда приходят. Сделать
 * документ, посмотреть на выданное, подключить и заплатить.
 */
export const SECTION_GROUPS: SectionGroup[] = [
  {
    id: 'award',
    title: 'Награждение',
    items: [
      {
        // Документы и шаблоны — одна плитка и одна страница: шаблон
        // существует ради документа, и отдельным входом он только
        // раздваивал дорогу к одному и тому же списку.
        path: '/documents',
        label: 'Документы и шаблоны',
        icon: FileText,
        about: 'Рабочие, архив, шаблоны',
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
];

/** Плоский список — там, где группы не нужны (поиск раздела по адресу). */
export const SECTIONS: Section[] = SECTION_GROUPS.flatMap((group) => group.items);

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
