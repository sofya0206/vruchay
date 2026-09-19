import type { EmailStatus } from '@prisma/client';

/**
 * Что таблица получателей знает о судьбе строки, кроме галочки.
 *
 * Отметка, выпущенный файл и письмо лежат в трёх разных местах, и до сих
 * пор их сводил в уме человек: галочку видел в таблице, письмо — в реестре,
 * а файл не видел нигде. Здесь достаём два недостающих факта, итог из них
 * складывает кабинет. Сами данные не трогаем — это чтение, а не новая модель.
 */

interface MailRecord {
  rowId: string | null;
  fileId: string | null;
  status: EmailStatus;
}

/**
 * Состояние последнего письма по каждой строке — о её нынешнем файле.
 *
 * Письмо о прежнем файле в счёт не идёт: после перевыпуска старое
 * «доставлено» говорит о документе, которого у человека уже нет, а новый
 * ещё никто не отправлял. Письмо без файла (рассылка без вложения) относится
 * к строке целиком и считается.
 *
 * Письма приходят по возрастанию времени постановки, позднее затирает раннее.
 */
export function lastMailByRow(
  rows: { id: string; lastFileId: string | null }[],
  emails: MailRecord[],
): Map<string, EmailStatus> {
  const fileOf = new Map(rows.map((r) => [r.id, r.lastFileId]));
  const result = new Map<string, EmailStatus>();
  for (const email of emails) {
    if (!email.rowId || !fileOf.has(email.rowId)) continue;
    if (email.fileId !== null && email.fileId !== fileOf.get(email.rowId)) continue;
    result.set(email.rowId, email.status);
  }
  return result;
}

/**
 * Поменялась ли строка после выпуска её файла.
 *
 * Сравниваем со снимком, сделанным при выпуске, только общие колонки:
 * переименование колонки меняет ключ, а не напечатанное, и без этого
 * любая правка шапки объявила бы устаревшими все документы материала.
 * У файлов, выпущенных до появления снимка, сравнивать не с чем — считаем,
 * что не менялись: ложная тревога на старых материалах хуже молчания.
 */
export function changedSinceIssue(
  data: Record<string, string>,
  issued: Record<string, string> | null,
): boolean {
  if (!issued) return false;
  for (const key of Object.keys(issued)) {
    if (!(key in data)) continue;
    if (String(data[key] ?? '').trim() !== String(issued[key] ?? '').trim()) return true;
  }
  return false;
}
