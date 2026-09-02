/**
 * SHA-256 файла в браузере — без отправки файла куда-либо.
 *
 * Сверка «файл на руках — тот самый, что выпущен» делается локально:
 * человек выбирает PDF, браузер считает отпечаток через WebCrypto
 * и сравнивает с тем, что отдала страница проверки. Файл с фамилией
 * при этом не покидает устройство — ровно поэтому серверной сверки нет.
 */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Сравнение без оглядки на регистр: сервер отдаёт нижний, человек мог вставить любой. */
export function sameDigest(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
