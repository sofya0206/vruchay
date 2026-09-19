import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { baseUrl, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { verifyPath } from '../verify/verify-url';
import { signRecipientToken, verifyRecipientToken } from './recipient-token';

/** То, что видит получатель на своей странице. Персональное здесь — только его собственное имя. */
export interface RecipientInfo {
  title: string;
  holder: string;
  issuer: string;
  issuedAt: string;
  code: string;
  verifyPath: string;
  /** Отозванный документ показываем, но файл не отдаём. */
  revoked: boolean;
}

@Injectable()
export class RecipientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Ссылка для письма: публичный адрес сервиса плюс подписанный токен. */
  linkFor(fileId: string): string {
    const secret = this.config.get('SESSION_SECRET', { infer: true });
    return `${baseUrl(this.config.get('PUBLIC_URL', { infer: true }))}/d/${signRecipientToken(secret, fileId)}`;
  }

  private async fileFor(token: string) {
    const parsed = verifyRecipientToken(this.config.get('SESSION_SECRET', { infer: true }), token);
    // «Не найдено» и для подделки, и для несуществующего файла: перебор
    // токенов не должен отличать одно от другого.
    if (!parsed) throw new NotFoundException('Документ не найден');
    if (parsed.expired) throw new GoneException('Срок ссылки истёк — документ есть во вложении письма');
    const file = await this.prisma.file.findFirst({
      where: { id: parsed.payload.fileId, kind: 'generated', deletedAt: null },
      include: {
        document: { select: { title: true, eventName: true } },
        row: { select: { data: true } },
      },
    });
    if (!file || !file.s3Key) throw new NotFoundException('Документ не найден');
    return file;
  }

  async info(token: string): Promise<RecipientInfo> {
    const file = await this.fileFor(token);
    const org = await this.prisma.organization.findUnique({ where: { id: file.orgId }, select: { name: true } });
    const issued = (file.issuedData ?? {}) as Record<string, unknown>;
    const row = (file.row?.data ?? {}) as Record<string, unknown>;
    const holder = [issued.name, issued.fio, row.name, row.fio].find((v): v is string => typeof v === 'string' && v.trim() !== '') ?? '';
    return {
      title: file.document?.title ?? 'Документ',
      holder,
      issuer: org?.name ?? '',
      issuedAt: file.createdAt.toISOString(),
      code: file.publicCode ?? file.publicId,
      verifyPath: verifyPath(file),
      revoked: file.verifyRevoked || file.revokedAt !== null,
    };
  }

  async pdf(token: string) {
    const file = await this.fileFor(token);
    if (file.verifyRevoked || file.revokedAt !== null) throw new NotFoundException('Документ отозван');
    return {
      stream: await this.storage.getStream(file.s3Key),
      filename: file.originalName || 'Документ.pdf',
      mime: file.mime,
    };
  }
}
