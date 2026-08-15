import type { SheetLayout } from '@gramota/shared';

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
  /** Сколько листов в документе. Показываем, только если их больше одного. */
  sheetCount?: number;
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
  verifyEnabled: boolean;
  verifyFields: string[];
  /** Мероприятие: одно на весь материал, подставляется переменными %event и др. */
  eventName: string;
  eventDate: string;
  eventPlace: string;
  eventHours: string;
  sheets: Sheet[];
}

export interface DocumentList {
  items: DocumentSummary[];
  total: number;
  limit: number;
  offset: number;
}
