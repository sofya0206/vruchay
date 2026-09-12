import type { ReactNode } from 'react';
import { CircleHelp, Globe, Link2, Send, Sheet, type LucideIcon } from 'lucide-react';
import { Info } from './Info';
import { Tilda } from './Tilda';
import { CreateStub } from './CreateStub';

export interface IntegrationSection {
  /** Часть адреса после /integrations/ — она же ключ раздела. */
  path: string;
  title: string;
  icon: LucideIcon;
  element: ReactNode;
}

/**
 * Разделы интеграций.
 *
 * Единственное место, где заводится площадка: и меню слева, и маршруты
 * берут список отсюда. Порядок повторяет порядок подключения — сначала
 * что это такое, потом сами площадки.
 */
export const INTEGRATION_SECTIONS: IntegrationSection[] = [
  { path: 'info', title: 'Как это работает', icon: CircleHelp, element: <Info /> },
  { path: 'tilda', title: 'Tilda', icon: Globe, element: <Tilda heading={false} /> },
  {
    path: 'google-sheets',
    title: 'Google Таблицы',
    icon: Sheet,
    element: (
      <CreateStub
        icon={Sheet}
        title="Google Таблицы"
        about="Документы будут выпускаться сами, по мере того как в таблицу добавляются строки с участниками."
      />
    ),
  },
  {
    path: 'telegram',
    title: 'Бот в Telegram',
    icon: Send,
    element: (
      <CreateStub
        icon={Send}
        title="Бот в Telegram"
        about="Участник напишет боту своё имя или адрес почты и получит свой документ, не заходя на сайт."
      />
    ),
  },
  {
    path: 'link',
    title: 'Форма по ссылке',
    icon: Link2,
    element: (
      <CreateStub
        icon={Link2}
        title="Форма по ссылке"
        about="Участник переходит по ссылке, сам заполняет пустые поля документа и отправляет его себе на почту. Свой сайт для этого не нужен."
      />
    ),
  },
];
