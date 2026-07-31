/**
 * Определение типа изображения по сигнатуре файла.
 *
 * Заголовку Content-Type и расширению из формы доверять нельзя: их задаёт клиент.
 * Загруженный под видом PNG скрипт или SVG со встроенным JavaScript — это XSS
 * в момент отдачи файла, поэтому тип определяем по первым байтам и принимаем
 * только растровые форматы из белого списка.
 */
export type AllowedImage = { mime: 'image/png'; ext: 'png' } | { mime: 'image/jpeg'; ext: 'jpg' };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(buf: Buffer, signature: number[]): boolean {
  if (buf.length < signature.length) return false;
  return signature.every((byte, i) => buf[i] === byte);
}

/** Возвращает тип изображения или null, если формат не из белого списка. */
export function detectImageType(buf: Buffer): AllowedImage | null {
  if (startsWith(buf, PNG_SIGNATURE)) return { mime: 'image/png', ext: 'png' };
  if (startsWith(buf, JPEG_SIGNATURE)) return { mime: 'image/jpeg', ext: 'jpg' };
  return null;
}

/** Фон в 300 DPI для A4 может весить много, но не больше этого. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
