import type { ReactNode } from 'react';
import { Info } from './Info';
import { Tilda } from './Tilda';
import { CreateStub } from './CreateStub';
import { InfoGlyph, LinkGlyph, SheetsGlyph, TelegramGlyph, TildaGlyph } from './glyphs';

export interface IntegrationSection {
  /** Часть адреса после /integrations/ — она же ключ раздела. */
  path: string;
  title: string;
  icon: ReactNode;
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
  { path: 'info', title: 'Инфо', icon: InfoGlyph, element: <Info /> },
  { path: 'tilda', title: 'Tilda', icon: TildaGlyph, element: <Tilda /> },
  {
    path: 'google-sheets',
    title: 'Google Таблицы',
    icon: SheetsGlyph,
    element: (
      <CreateStub
        title="Интеграция с Google Таблицами"
        about="Документы будут выпускаться сами, по мере того как в таблицу добавляются строки с участниками."
      />
    ),
  },
  {
    path: 'telegram',
    title: 'Бот в Telegram',
    icon: TelegramGlyph,
    element: (
      <CreateStub
        title="Бот в Telegram"
        about="Участник напишет боту своё имя или адрес почты и получит свой документ, не заходя на сайт."
      />
    ),
  },
  {
    path: 'link',
    title: 'Форма по ссылке',
    icon: LinkGlyph,
    element: (
      <CreateStub
        title="Форма по ссылке"
        about="Ссылка на форму нашего сервиса: участник переходит по ней, сам заполняет пустые поля документа и отправляет его себе на почту. Свой сайт для этого не нужен."
      />
    ),
  },
];
