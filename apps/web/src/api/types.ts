import type { DocumentCategory, SheetLayout } from '@gramota/shared';

export interface Me {
  email: string;
  name: string;
  role: string;
  /**
   * Мы сами, а не организация-клиент.
   *
   * По этому признаку прячем разделы, за которыми клиента ждёт отказ:
   * счета, заявки, тарифы организаций. Права всё равно проверяет сервер —
   * здесь речь о том, чтобы не звать человека туда, куда ему нельзя.
   */
  isPlatform?: boolean;
}

export interface Sheet {
  id: string;
  documentId: string;
  position: number;
  backgroundFileId: string | null;
  layout: SheetLayout;
  schemaVersion: number;
}

export interface DocumentSummary {
  id: string;
  title: string;
  pageWidthMm: number;
  pageHeightMm: number;
  createdAt: string;
  updatedAt: string;
  /** Заполнено только у документов в корзине — по нему считается срок. */
  deletedAt?: string | null;
  /** Раздел библиотеки. null — материал заведён без раздела. */
  category?: DocumentCategory | null;
  /**
   * Материал, с которого снята копия под новое мероприятие. null и когда
   * копии ни с чего не снимали, и когда исходник лежит в корзине:
   * открыть его всё равно нельзя, а мёртвая ссылка хуже её отсутствия.
   */
  source?: { id: string; title: string } | null;
  /** Сколько листов в документе. Показываем, только если их больше одного. */
  sheetCount?: number;
  /**
   * Мероприятие материала и число строк в его таблице получателей.
   *
   * Нужны там, где материал выбирают из списка: одинаково названные
   * «Грамоты за место» иначе неразличимы, а рассылка необратима.
   */
  eventName?: string;
  eventDate?: string;
  recipientCount?: number;
  /**
   * Первый лист — чтобы показать документ прямо в списке, не открывая его.
   * Необязателен: карточка документа отдаёт листы целиком и превью не шлёт.
   */
  preview?: {
    layout: SheetLayout;
    backgroundUrl: string | null;
  };
}

export interface DocumentDetail extends DocumentSummary {
  /**
   * Набор правил награждения, привязанный к соревнованию. null — раскладка
   * не настроена: документы выпускаются по одному макету на всех.
   */
  ruleSetId: string | null;
  verifyEnabled: boolean;
  verifyFields: string[];
  /** Мероприятие: одно на весь материал, подставляется переменными %event и др. */
  eventName: string;
  eventDate: string;
  eventPlace: string;
  eventHours: string;
  /** Дата выдачи днём (ГГГГ-ММ-ДД) либо null — в день выпуска. */
  issueDate: string | null;
  sheets: Sheet[];
}

export interface DocumentList {
  items: DocumentSummary[];
  total: number;
  limit: number;
  offset: number;
}
