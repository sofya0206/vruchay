import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TRASH_DAYS, daysLeftInTrash } from '@gramota/shared';
import { PrismaService } from '../prisma/prisma.service';
import { cell } from '../documents/registry.service';
import { fileState, type FileState } from './file-state';
import { registryWhere } from './registry-filter';
import type { ListRegistryDto, RegistryFilterDto } from './registry.dto';
import { ReplacementService } from './replacement.service';

/** Сколько записей журнала показываем в карточке документа. */
const HISTORY_LIMIT = 100;

/** Строка реестра — то, что видно в таблице выданного. */
export interface RegistryRow {
  fileId: string;
  publicId: string;
  name: string;
  email: string;
  documentId: string | null;
  documentTitle: string;
  eventName: string;
  eventDate: string;
  issuedAt: Date;
  state: FileState;
  /** Перевыпуск заказан, но нового документа ещё нет. */
  reissuePending: boolean;
  replacedBy: { fileId: string; publicId: string; issuedAt: Date } | null;
  mail: { status: string; sentAt: Date | null; error: string | null } | null;
  verifyCount: number;
  verifyLastAt: Date | null;
  downloadCount: number;
  /** Когда файлы удалятся по сроку хранения. Null — материал не в корзине. */
  retention: { trashedAt: Date; purgeAt: Date; daysLeft: number } | null;
}

/**
 * Реестр выданного по всей организации.
 *
 * Отдельно от реестра внутри материала (`documents/registry.service.ts`)
 * намеренно: тот отвечает на вопрос «кому мы раздали грамоты на этом
 * турнире», а этот — на вопрос «где документ, который мы выдали месяц
 * назад», и материал в нём как раз неизвестен. Ради второго вопроса
 * раздел и делается: без него сервис одноразовый.
 */
@Injectable()
export class RegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly replacement: ReplacementService,
  ) {}

  /**
   * Страница реестра.
   *
   * Считаем и режем на сервере: за сезон у федерации накапливаются десятки
   * тысяч выданных документов, и выгрузка их в браузер целиком означала бы
   * минуту белого экрана вместо таблицы.
   */
  async list(orgId: string, query: ListRegistryDto) {
    const where = registryWhere(orgId, query);

    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: fileSelect,
      }),
      this.prisma.file.count({ where }),
    ]);

    const items = await this.decorate(files);
    return { items, total, limit: query.limit, offset: query.offset };
  }

  /**
   * Значения для выпадающих списков фильтра.
   *
   * Материалы и мероприятия берём только те, по которым что-то выдано:
   * фильтр, предлагающий выбор, после которого таблица пуста, — это
   * обещание данных, которых нет.
   */
  async facets(orgId: string) {
    const documents = await this.prisma.document.findMany({
      where: { orgId, files: { some: { kind: 'generated', deletedAt: null } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { id: true, title: true, eventName: true, eventDate: true, deletedAt: true },
    });

    const events = [...new Set(documents.map((d) => d.eventName.trim()).filter(Boolean))];
    return { documents, events, trashDays: TRASH_DAYS };
  }

  /**
   * Карточка одного выданного документа: что с ним было и что с ним стало.
   *
   * Три источника, сведённые в одну ленту: журнал действий организации,
   * события писем и сам файл. По отдельности каждый отвечает на четверть
   * вопроса «что случилось с грамотой Ивановой».
   *
   * Имена сотрудников показываем только владельцу и управляющему — тем же,
   * кому открыт журнал организации. Кто из коллег нажал кнопку, рядовому
   * сотруднику знать незачем, а само событие важно всем.
   */
  async detail(orgId: string, fileId: string, showActors: boolean) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, orgId, kind: 'generated', deletedAt: null },
      select: fileSelect,
    });
    if (!file) throw new NotFoundException('Документ не найден');

    const [row] = await this.decorate([file]);

    const emails = await this.prisma.email.findMany({
      where: { orgId, fileId },
      orderBy: { queuedAt: 'asc' },
      select: {
        id: true,
        toEmail: true,
        status: true,
        error: true,
        queuedAt: true,
        events: {
          orderBy: { occurredAt: 'asc' },
          select: { type: true, source: true, occurredAt: true },
        },
      },
    });

    const audit = await this.prisma.auditEvent.findMany({
      where: {
        orgId,
        OR: [
          { targetType: 'file', targetId: fileId },
          ...(file.documentId ? [{ targetType: 'document', targetId: file.documentId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        action: true,
        summary: true,
        actorName: true,
        actorEmail: true,
        createdAt: true,
      },
    });

    const history: HistoryEntry[] = [
      {
        at: file.createdAt,
        kind: 'issued' as const,
        title: 'Документ выпущен',
        detail: '',
        actor: '',
      },
      ...emails.flatMap((email) =>
        email.events.map((event) => ({
          at: event.occurredAt,
          kind: 'mail' as const,
          title: mailEventTitle(event.type),
          detail: email.toEmail,
          actor: '',
        })),
      ),
      ...audit.map((event) => ({
        at: event.createdAt,
        kind: 'action' as const,
        title: event.summary || event.action,
        detail: '',
        actor: showActors ? event.actorName || event.actorEmail : '',
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    return {
      row,
      /*
       * Число проверок — обезличенное. Ни адресов, ни устройств, ни времени
       * каждой отдельной проверки мы не храним: организации нужен ответ
       * «сертификат проверили 47 раз», а слежка за теми, кто проверяет,
       * сделала бы нас оператором персональных данных вместо обработчика
       * по поручению.
       */
      verifyCount: file.verifyCount,
      verifyLastAt: file.verifyLastAt,
      emails: emails.map((e) => ({
        id: e.id,
        toEmail: e.toEmail,
        status: e.status,
        error: e.error,
        queuedAt: e.queuedAt,
      })),
      history: history.slice(0, HISTORY_LIMIT),
    };
  }

  /**
   * Тот же реестр таблицей для Excel.
   *
   * Экранирование ячеек берём из реестра материала — правило одно и то же
   * (значение, начинающееся с «=», Excel выполняет), и второе его изложение
   * однажды разошлось бы с первым.
   */
  async csv(orgId: string, filter: RegistryFilterDto, limit: number): Promise<string> {
    const files = await this.prisma.file.findMany({
      where: registryWhere(orgId, filter),
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: fileSelect,
    });
    const items = await this.decorate(files);

    const header = [
      '№',
      'ФИО',
      'Адрес почты',
      'Материал',
      'Мероприятие',
      'Выдан',
      'Проверочный код',
      'Состояние',
      'Письмо',
      'Проверок по QR',
      'Удаление по сроку',
    ];
    const lines = [header.map(cell).join(';')];

    items.forEach((item, index) => {
      lines.push(
        [
          String(index + 1),
          item.name,
          item.email,
          item.documentTitle,
          item.eventName,
          formatDate(item.issuedAt),
          item.publicId,
          stateLabel(item.state, item.reissuePending),
          mailLabel(item.mail?.status ?? null),
          String(item.verifyCount),
          item.retention ? formatDate(item.retention.purgeAt) : '',
        ]
          .map(cell)
          .join(';'),
      );
    });

    // \uFEFF — метка порядка байтов, записана escape-последовательностью:
    // сам символ невидим, и в исходнике его легко потерять при правке.
    return `\uFEFF${lines.join('\r\n')}\r\n`;
  }

  /** Файлы под скачивание пачкой — с проверкой принадлежности организации. */
  async filesForArchive(orgId: string, filter: RegistryFilterDto, ids: string[], take: number) {
    return this.prisma.file.findMany({
      where: registryWhere(orgId, filter, ids),
      orderBy: { createdAt: 'asc' },
      take,
      select: {
        id: true,
        s3Key: true,
        mime: true,
        originalName: true,
        publicId: true,
        row: { select: { data: true } },
      },
    });
  }

  /**
   * Достраивает строки таблицы: состояние, замена, письмо, срок хранения.
   *
   * Всё дополнительное берём пакетными запросами по всей странице, а не
   * по строке: полсотни строк — это полсотни лишних обращений к базе,
   * и на них уходит больше времени, чем на саму выборку.
   */
  private async decorate(files: FileRecord[]): Promise<RegistryRow[]> {
    if (files.length === 0) return [];

    const settled = await this.replacement.settle(files);
    const resolved = files.map((file) => ({
      ...file,
      replacedById: settled.has(file.id)
        ? (settled.get(file.id)?.replacedById ?? null)
        : file.replacedById,
      replacedByJobId: settled.has(file.id) ? null : file.replacedByJobId,
    }));

    const replacementIds = resolved
      .map((f) => f.replacedById)
      .filter((id): id is string => id !== null);

    const [replacements, emails] = await Promise.all([
      replacementIds.length > 0
        ? this.prisma.file.findMany({
            where: { id: { in: replacementIds }, orgId: files[0].orgId },
            select: { id: true, publicId: true, createdAt: true },
          })
        : Promise.resolve([]),
      this.prisma.email.findMany({
        where: { fileId: { in: files.map((f) => f.id) }, orgId: files[0].orgId },
        orderBy: { queuedAt: 'asc' },
        select: { fileId: true, status: true, sentAt: true, error: true },
      }),
    ]);

    const byId = new Map(replacements.map((r) => [r.id, r]));
    // Последнее письмо отражает нынешнее состояние доставки: идём по
    // возрастанию, поэтому позднее затирает раннее.
    const lastEmail = new Map<string, (typeof emails)[number]>();
    for (const email of emails) if (email.fileId) lastEmail.set(email.fileId, email);

    return resolved.map((file) => {
      const data = (file.row?.data ?? {}) as Record<string, string>;
      const email = lastEmail.get(file.id);
      const replacement = file.replacedById ? byId.get(file.replacedById) : undefined;

      return {
        fileId: file.id,
        publicId: file.publicId,
        name: data.name ?? '',
        email: data.email ?? '',
        documentId: file.documentId,
        documentTitle: file.document?.title ?? 'Материал удалён',
        eventName: file.document?.eventName ?? '',
        eventDate: file.document?.eventDate ?? '',
        issuedAt: file.createdAt,
        state: fileState(file),
        reissuePending: file.replacedByJobId !== null && file.replacedById === null,
        replacedBy: replacement
          ? { fileId: replacement.id, publicId: replacement.publicId, issuedAt: replacement.createdAt }
          : null,
        mail: email ? { status: email.status, sentAt: email.sentAt, error: email.error } : null,
        verifyCount: file.verifyCount,
        verifyLastAt: file.verifyLastAt,
        downloadCount: file.downloadCount,
        retention: retentionOf(file.document?.deletedAt ?? null),
      };
    });
  }
}

/** Одна запись ленты «что было с документом». */
export interface HistoryEntry {
  at: Date;
  kind: 'issued' | 'mail' | 'action';
  title: string;
  detail: string;
  actor: string;
}

const fileSelect = {
  id: true,
  orgId: true,
  publicId: true,
  documentId: true,
  createdAt: true,
  verifyRevoked: true,
  replacedById: true,
  replacedByJobId: true,
  rowId: true,
  verifyCount: true,
  verifyLastAt: true,
  downloadCount: true,
  row: { select: { data: true } },
  document: { select: { title: true, eventName: true, eventDate: true, deletedAt: true } },
} satisfies Prisma.FileSelect;

type FileRecord = Prisma.FileGetPayload<{ select: typeof fileSelect }>;

/**
 * Когда файлы будут стёрты по сроку хранения.
 *
 * Считается только для материалов в корзине, и это не упущение: пока
 * материал жив, срока у выданных файлов нет — организация сама решает,
 * сколько хранить документы своих участников. Срок начинает течь с того
 * дня, когда материал отправили в корзину; TRASH_DAYS дней спустя ночная
 * уборка удаляет и записи, и сами файлы (ч. 7 ст. 5 152-ФЗ — хранить
 * не дольше, чем требует цель).
 */
function retentionOf(trashedAt: Date | null): RegistryRow['retention'] {
  if (!trashedAt) return null;
  const purgeAt = new Date(trashedAt);
  purgeAt.setDate(purgeAt.getDate() + TRASH_DAYS);
  return { trashedAt, purgeAt, daysLeft: daysLeftInTrash(trashedAt) };
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(date);
}

export function stateLabel(state: FileState, pending: boolean): string {
  if (state === 'revoked') return 'отозван';
  if (state === 'replaced') return 'заменён';
  return pending ? 'перевыпускается' : 'действителен';
}

export function mailLabel(status: string | null): string {
  const labels: Record<string, string> = {
    queued: 'в очереди',
    sent: 'отправлено',
    delivered: 'доставлено',
    opened: 'прочитано',
    bounced: 'не доставлено',
    failed: 'ошибка',
  };
  return status ? (labels[status] ?? status) : 'не отправлялось';
}

function mailEventTitle(type: string): string {
  const titles: Record<string, string> = {
    sent: 'Письмо отправлено',
    delivered: 'Письмо доставлено',
    opened: 'Письмо прочитано',
    bounced: 'Письмо не доставлено',
    failed: 'Письмо не отправилось',
  };
  return titles[type] ?? `Событие письма: ${type}`;
}
