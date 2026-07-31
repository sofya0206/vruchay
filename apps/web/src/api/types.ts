import type { SheetLayout } from '@gramota/shared';

export interface Me {
  email: string;
  name: string;
  role: string;
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
}

export interface DocumentDetail extends DocumentSummary {
  verifyEnabled: boolean;
  verifyFields: string[];
  sheets: Sheet[];
}

export interface DocumentList {
  items: DocumentSummary[];
  total: number;
  limit: number;
  offset: number;
}
