import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import type { Env } from '../config/env';

/** Ссылки для личного кабинета живут недолго — файлы содержат персональные данные. */
const PRESIGNED_TTL_SECONDS = 15 * 60;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
      // MinIO и большинство российских S3 работают по path-style адресации
      forcePathStyle: true,
    });
  }

  /**
   * Самый свежий объект по приставке ключа в указанном бакете.
   *
   * Бакет передаётся отдельно, потому что копии базы лежат не там же,
   * где файлы документов: у бакета копий свои права, и класть их вместе
   * значило бы, что ключ приложения открывает и то и другое.
   *
   * Возвращает null, если объектов нет, — а не бросает: «копий нет» это
   * тот самый ответ, ради которого вызов и делается.
   */
  async newestObject(
    bucket: string,
    prefix: string,
  ): Promise<{ key: string; lastModified: Date; size: number } | null> {
    let newest: { key: string; lastModified: Date; size: number } | null = null;
    let token: string | undefined;

    // Копии за месяц в одну страницу помещаются, но полагаться на это
    // нельзя: страница ограничена тысячей объектов, а не сроком хранения.
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key || !obj.LastModified) continue;
        if (!newest || obj.LastModified > newest.lastModified) {
          newest = { key: obj.Key, lastModified: obj.LastModified, size: obj.Size ?? 0 };
        }
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);

    return newest;
  }

  /**
   * Перечисляет объекты приложения постранично, по приставке ключа.
   *
   * Отдаёт по одному, а не списком: в бакете лежат все выданные документы
   * организаций, и складывать весь перечень в память ради ночной сверки
   * незачем. Страницу за страницей забирает сам вызывающий.
   */
  async *listObjects(prefix: string): AsyncGenerator<{ key: string; lastModified: Date }> {
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key || !obj.LastModified) continue;
        yield { key: obj.Key, lastModified: obj.LastModified };
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }

  async put(key: string, body: Buffer | Readable, mime: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mime }),
    );
  }

  async getStream(key: string): Promise<Readable> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return res.Body as Readable;
  }

  /** Временная прямая ссылка для скачивания из личного кабинета. */
  async presignedGetUrl(key: string, ttlSeconds = PRESIGNED_TTL_SECONDS): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      // Удаление файла не должно ронять пользовательскую операцию:
      // объект, оставшийся без записи в базе, заберёт ночная сверка
      // хранилища с таблицей файлов (RetentionService.purgeOrphanObjects).
      this.logger.warn(`Не удалось удалить объект ${key}: ${String(err)}`);
    }
  }
}
