import { Readable } from 'node:stream';

/**
 * Хранилище в памяти вместо MinIO.
 *
 * Единственная подмена во всём слое, и она не про базу: Prisma здесь
 * не подменяется нигде. S3 в конвейере нет — работа `integration`
 * поднимает Postgres и Redis, а поднимать ради байтов ещё и объектное
 * хранилище значит платить минутами за проверку того, что и так проверено
 * `s3-key.test.ts`.
 *
 * Важно, что байты настоящие: тест рендера достаёт отсюда тот самый PDF,
 * который напечатал Chromium, и заглядывает внутрь.
 */
export class MemoryStorage {
  private readonly objects = new Map<string, Buffer>();

  async put(key: string, body: Buffer | Readable): Promise<void> {
    this.objects.set(key, Buffer.isBuffer(body) ? Buffer.from(body) : await collect(body));
  }

  async getStream(key: string): Promise<Readable> {
    const body = this.objects.get(key);
    if (!body) throw new Error(`Объекта ${key} в хранилище нет`);
    return Readable.from(body);
  }

  async presignedGetUrl(key: string): Promise<string> {
    return `http://storage.invalid/${encodeURIComponent(key)}`;
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async newestObject(): Promise<null> {
    return null;
  }

  /** Байты выпущенного документа — для проверок, а не для приложения. */
  read(key: string): Buffer | undefined {
    return this.objects.get(key);
  }

  get size(): number {
    return this.objects.size;
  }
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
