/**
 * Путь страницы проверки для экземпляра документа.
 *
 * Короткий адрес `/c/K7M2-9QXR-4TVB` — для документов с публичным кодом:
 * он идёт в QR (меньше модулей, крупнее узор при том же размере) и на
 * бумагу. Прежний `/verify/<uuid>` остаётся у документов, выпущенных
 * до появления кода: их QR уже напечатан, и переписывать его нечем.
 *
 * Одна функция на воркер печати, страницу проверки, реестр и окно
 * успеха публичной формы: адрес, собранный в четырёх местах по-разному,
 * рано или поздно разошёлся бы в одном из них.
 */
export function verifyPath(file: { publicId: string; publicCode?: string | null }): string {
  return file.publicCode ? `/c/${file.publicCode}` : `/verify/${file.publicId}`;
}

/** Полный адрес: публичный адрес сервиса без черты на конце плюс путь. */
export function verifyUrl(
  publicUrl: string,
  file: { publicId: string; publicCode?: string | null },
): string {
  return `${publicUrl}${verifyPath(file)}`;
}
