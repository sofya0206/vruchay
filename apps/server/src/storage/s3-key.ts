import type { FileKind } from '@prisma/client';

/**
 * Ключи в S3 строятся детерминированно из идентификаторов БД.
 * Источник истины — база; в S3 лежат только байты, поэтому по ключу
 * всегда можно понять, чей это файл и к какому документу он относится.
 */
export function buildS3Key(params: {
  orgId: string;
  kind: FileKind;
  fileId: string;
  ext: string;
  documentId?: string;
  jobId?: string;
}): string {
  const { orgId, kind, fileId, documentId, jobId } = params;
  const ext = params.ext.replace(/^\./, '').toLowerCase();

  if (kind === 'font') return `org/${orgId}/fonts/${fileId}.${ext}`;

  if (!documentId) {
    throw new Error(`documentId обязателен для файлов типа "${kind}"`);
  }

  const base = `org/${orgId}/doc/${documentId}`;
  switch (kind) {
    case 'background':
      return `${base}/bg/${fileId}.${ext}`;
    case 'asset':
      return `${base}/asset/${fileId}.${ext}`;
    case 'generated':
      if (!jobId) throw new Error('jobId обязателен для сгенерированных файлов');
      return `${base}/gen/${jobId}/${fileId}.${ext}`;
  }
}

/** Безопасное имя файла для Content-Disposition: кириллица кодируется по RFC 5987 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
