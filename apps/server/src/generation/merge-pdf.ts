import { PDFDocument } from 'pdf-lib';

/**
 * Склейка выпущенных PDF в один файл на печать.
 *
 * Печать пачкой — это не про красоту, а про то, что триста отдельных файлов
 * невозможно отправить на принтер, не открыв каждый. Поэтому склеиваем
 * уже готовые файлы, а не печатаем заново: перерисовывать в Chromium то,
 * что час назад отрисовано и лежит в хранилище, — двойная работа и вторая
 * возможность получить другой результат.
 *
 * Битый файл в середине пачки не должен обрывать всю печать: такие
 * пропускаем и возвращаем их число — пусть вызывающий решает, промолчать
 * или сказать. Пустой результат — уже отказ: печатать нечего.
 */
export async function mergePdfs(
  sources: Buffer[],
): Promise<{ pdf: Buffer; pages: number; skipped: number }> {
  const merged = await PDFDocument.create();
  let skipped = 0;

  for (const source of sources) {
    try {
      const doc = await PDFDocument.load(source, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    } catch {
      skipped++;
    }
  }

  const pages = merged.getPageCount();
  if (pages === 0) {
    throw new Error(`Ни один из ${sources.length} файлов не удалось прочитать как PDF`);
  }

  return { pdf: Buffer.from(await merged.save()), pages, skipped };
}
