/**
 * `fileId` всех блоков-картинок макета.
 *
 * Макет принимается любым — и разобранным, и сырым JSON из базы: печати
 * и проверке при сохранении нужен только этот список, а полный разбор
 * схемой ради него переписывал бы каждый текстовый блок.
 */
export function imageFileIds(layout: unknown): string[] {
  if (!Array.isArray(layout)) return [];
  const ids = new Set<string>();
  for (const el of layout as unknown[]) {
    if (!el || typeof el !== 'object') continue;
    const { type, props } = el as { type?: unknown; props?: { fileId?: unknown } };
    if (type === 'image' && typeof props?.fileId === 'string') ids.add(props.fileId);
  }
  return [...ids];
}
