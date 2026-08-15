/**
 * Согласование размеров листа и загруженного бланка.
 *
 * Картинка растягивается на весь лист. Если её пропорции не совпадают
 * с пропорциями листа, бланк перекашивается — герб становится овальным,
 * рамка неравномерной. Само по себе это не мешает ни выпуску, ни печати:
 * перекошенная грамота создаётся ровно так же успешно, как правильная,
 * и брак обнаруживает получатель.
 *
 * Поэтому спрашиваем сразу после загрузки, а не молча растягиваем.
 */

/** Размеры картинки в пикселях. */
export interface ImageSize {
  width: number;
  height: number;
}

/** Читает размеры выбранного файла, не отправляя его на сервер. */
export function readImageSize(file: File): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать картинку'));
    };
    img.src = url;
  });
}

/**
 * Насколько лист не совпадает с бланком и какой размер предложить взамен.
 *
 * Допуск в один процент: разница меньше глазом не видна, а спрашивать
 * из-за неё — навязчиво. Типографские бланки почти всегда отличаются
 * от идеального A4 на доли миллиметра из-за припусков на резку.
 */
const TOLERANCE = 0.01;

export interface PageFit {
  /** Нужно ли вообще спрашивать. */
  mismatched: boolean;
  /** Что предложить: те же миллиметры, но в пропорциях бланка. */
  suggested: { widthMm: number; heightMm: number };
}

export function fitPageToImage(
  page: { widthMm: number; heightMm: number },
  image: ImageSize,
): PageFit {
  const pageRatio = page.widthMm / page.heightMm;
  const imageRatio = image.width / image.height;

  /*
   * Длинную сторону листа оставляем как есть, короткую пересчитываем.
   *
   * Так предложенный размер остаётся в знакомых числах: A4 альбомная
   * 297×210 превращается в 297×223, а не в «неизвестно что». Считать
   * миллиметры из пикселей по предполагаемому разрешению нельзя — в файле
   * его может не быть вовсе, и тогда бланк уехал бы в произвольный размер.
   */
  const suggested =
    page.widthMm >= page.heightMm
      ? { widthMm: page.widthMm, heightMm: round(page.widthMm / imageRatio) }
      : { widthMm: round(page.heightMm * imageRatio), heightMm: page.heightMm };

  return {
    mismatched: Math.abs(pageRatio - imageRatio) / pageRatio > TOLERANCE,
    suggested,
  };
}

/** Миллиметры показываем целыми: доли в размере листа никому не нужны. */
function round(mm: number): number {
  return Math.max(10, Math.round(mm));
}
