import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { fileState, type FileState } from '../registry/file-state';
import { maskVerifyFields } from '../verify/name-mask';
import { normalizePublicCode } from '../verify/public-code';
import { verifyPath } from '../verify/verify-url';

/** Сколько совпадений отдаём при поиске по ФИО. */
const NAME_SEARCH_LIMIT = 20;

/** Сколько программ показываем на странице организации. */
const PROGRAMS_LIMIT = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Публичный реестр эмитента — страница организации снаружи.
 *
 * Отдельная сущность, а не режим внутреннего реестра: у внутреннего
 * права сотрудников и все поля, у этого — ни входа, ни персональных
 * данных сверх того, что эмитент явно разрешил. Смешать их значило бы
 * однажды показать наружу колонку, которую видно только внутри.
 *
 * Организация показывается только по своему решению (`publicPageEnabled`)
 * и только по адресу, который сама выбрала (`slug`): по идентификатору
 * из базы страницы нет, чтобы перебор UUID не давал списка клиентов.
 */
@Injectable()
export class PublicOrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Страница организации: кто это и что выдаёт. */
  async page(slug: string) {
    const org = await this.findPublished(slug);

    /*
     * Программы — материалы, по которым что-то выдано и проверка
     * включена. Считаем по файлам, а не по материалам: материал без
     * выданных документов на странице ничего не подтверждает.
     */
    const issued = await this.prisma.file.groupBy({
      by: ['documentId'],
      where: this.issuedWhere(org.id),
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });
    const documentIds = issued.map((i) => i.documentId).filter((id): id is string => id !== null);
    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds }, orgId: org.id, deletedAt: null, verifyEnabled: true },
      select: { id: true, title: true, eventName: true, eventDate: true },
      orderBy: { createdAt: 'desc' },
      take: PROGRAMS_LIMIT,
    });
    const counts = new Map(issued.map((i) => [i.documentId, i]));

    return {
      name: org.name,
      slug: org.slug,
      description: org.description,
      inn: org.inn,
      website: org.website,
      contactEmail: org.contactEmail,
      contactPhone: org.contactPhone,
      logoUrl: org.logo?.s3Key ? await this.storage.presignedGetUrl(org.logo.s3Key) : null,
      verified: org.verifiedIssuer,
      verifiedAt: org.verifiedAt,
      indexable: org.publicIndexable,
      searchByName: org.publicSearchByName,
      programs: documents.map((d) => ({
        id: d.id,
        title: d.title,
        eventName: d.eventName,
        eventDate: d.eventDate,
        issued: counts.get(d.id)?._count._all ?? 0,
        firstIssuedAt: counts.get(d.id)?._min.createdAt ?? null,
        lastIssuedAt: counts.get(d.id)?._max.createdAt ?? null,
      })),
    };
  }

  /**
   * Документ по номеру — всегда доступен.
   *
   * Отвечает только адресом страницы проверки: всё о документе говорит
   * она, а здесь важно одно — выдан ли такой номер этой организацией.
   * Чужой номер и несуществующий отвечают одинаково.
   */
  async findByCode(slug: string, raw: string) {
    const org = await this.findPublished(slug);
    const code = normalizePublicCode(raw);
    const where: Prisma.FileWhereInput = UUID.test(raw.trim())
      ? { publicId: raw.trim().toLowerCase() }
      : code
        ? { publicCode: code }
        : {};
    if (Object.keys(where).length === 0) throw new NotFoundException('Документ не найден');

    const file = await this.prisma.file.findFirst({
      where: { ...this.issuedWhere(org.id), ...where },
      select: { publicId: true, publicCode: true },
    });
    if (!file) throw new NotFoundException('Документ не найден');
    return { path: verifyPath(file) };
  }

  /**
   * Поиск по ФИО — только если эмитент его включил.
   *
   * Без включения отвечаем «не найдено», как и на несуществующую
   * организацию: страница снаружи не должна подтверждать, что у этой
   * организации поиск есть, но закрыт.
   *
   * Поиск по фамилии без согласия субъекта — распространение
   * персональных данных (ст. 10.1 152-ФЗ); согласие собирает эмитент
   * как оператор и подтверждает это при включении настройки.
   *
   * Ищем по снимку на момент выпуска, а не по живой строке, и отдаём
   * имя так, как эмитент разрешил показывать его на странице проверки.
   * Короткие запросы не ищем: «Ив» вернул бы половину реестра.
   */
  async searchByName(slug: string, raw: string) {
    const org = await this.findPublished(slug);
    if (!org.publicSearchByName) throw new NotFoundException('Поиск по имени недоступен');

    const query = raw.trim().replace(/\s+/g, ' ');
    if (query.length < 3) return { items: [] };

    const files = await this.prisma.file.findMany({
      where: {
        ...this.issuedWhere(org.id),
        OR: [
          { issuedData: { path: ['name'], string_contains: query, mode: 'insensitive' } },
          // У документов, выпущенных до появления снимка, есть только строка.
          {
            issuedData: { equals: Prisma.DbNull },
            row: { data: { path: ['name'], string_contains: query, mode: 'insensitive' } },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: NAME_SEARCH_LIMIT,
      select: {
        publicId: true,
        publicCode: true,
        createdAt: true,
        expiresAt: true,
        verifyRevoked: true,
        replacedById: true,
        issuedData: true,
        row: { select: { data: true } },
        document: { select: { title: true, eventName: true, eventDate: true } },
      },
    });

    return {
      items: files.map((f) => {
        const source = (f.issuedData ?? f.row?.data ?? {}) as Record<string, string>;
        const fields = maskVerifyFields({ name: source.name ?? '' }, org.verifyNameMode);
        return {
          code: f.publicCode ?? f.publicId,
          path: verifyPath(f),
          name: fields.name ?? '',
          title: f.document?.title ?? '',
          eventName: f.document?.eventName ?? '',
          eventDate: f.document?.eventDate ?? '',
          issuedAt: f.createdAt,
          state: fileState(f) as FileState,
        };
      }),
    };
  }

  /** Организация, которая сама решила показываться наружу. */
  private async findPublished(slug: string) {
    const org = await this.prisma.organization.findFirst({
      where: { slug: slug.trim().toLowerCase(), publicPageEnabled: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        inn: true,
        website: true,
        contactEmail: true,
        contactPhone: true,
        verifiedIssuer: true,
        verifiedAt: true,
        publicIndexable: true,
        publicSearchByName: true,
        verifyNameMode: true,
        logo: { select: { s3Key: true } },
      },
    });
    if (!org) throw new NotFoundException('Организация не найдена');
    return org;
  }

  /** Выданное и открытое для проверки — то же условие, что у страницы проверки. */
  private issuedWhere(orgId: string): Prisma.FileWhereInput {
    return {
      orgId,
      kind: 'generated',
      deletedAt: null,
      s3Key: { not: '' },
      document: { deletedAt: null, verifyEnabled: true },
    };
  }
}
