import { CreditCard, type LucideIcon } from 'lucide-react';

export interface Section {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Одна строка: что здесь делают. Длиннее — уже статья, а не навигация. */
  about: string;
}

/*
 * Разделы, у которых пока нет своего экрана, — их рисует заглушка.
 *
 * Навигация кабинета живёт в `nav.ts`; здесь остаётся только то, что
 * нужно `SectionStub`: название и строка объяснения. Когда раздел
 * получает экран, он уходит отсюда в маршруты.
 */
export const SECTIONS: Section[] = [
  {
    path: '/billing',
    label: 'Оплата',
    icon: CreditCard,
    about: 'Тариф, счета, закрывающие',
  },
];
