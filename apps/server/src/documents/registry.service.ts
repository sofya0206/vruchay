import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Реестр выданных документов.
 *
 * Федерации спрашивают его первым делом, и не из любопытства: наградной
 * документ — основание для разряда, допуска и отчётности, и организация
 * обязана уметь ответить, кому и когда он выдан. Без реестра единственным
 * доказательством остаётся письмо в чужом почтовом ящике.
 *
 * Собирается из уже имеющихся данных, отдельной таблицы не заводим:
 * строка получателя знает свой последний файл, файл знает время создания
 * и публичный идентификатор, письмо — состояние доставки.
 */
@Injectable()
export class RegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, orgId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!doc) throw new NotFoundException('Документ не найден');

    const rows = await this.prisma.recipientRow.findMany({
      where: { documentId, lastFileId: { not: null } },
      orderBy: { position: 'asc' },
      include: {
        lastFile: {
          select: { id: true, publicId: true, createdAt: true, sizeBytes: true, verifyRevoked: true },
        },
      },
    });

    // Письма берём отдельным запросом: обратной связи от строки к письмам
    // в схеме нет, а заводить её ради реестра — менять модель данных
    // под способ её чтения.
    const emails = await this.prisma.email.findMany({
      where: { documentId, orgId, rowId: { in: rows.map((r) => r.id) } },
      orderBy: { queuedAt: 'asc' },
      select: { rowId: true, toEmail: true, status: true, sentAt: true, error: true },
    });

    // Последнее письмо по каждой строке: оно и отражает нынешнее состояние
    // доставки. Перебираем по возрастанию, поэтому позднее затирает раннее.
    const lastEmail = new Map<string, (typeof emails)[number]>();
    for (const e of emails) if (e.rowId) lastEmail.set(e.rowId, e);

    return {
      document: doc,
      total: rows.length,
      items: rows.map((row) => {
        const data = row.data as Record<string, string>;
        const email = lastEmail.get(row.id);
        return {
          rowId: row.id,
          name: data.name ?? '',
          email: email?.toEmail ?? data.email ?? '',
          fields: data,
          fileId: row.lastFile!.id,
          publicId: row.lastFile!.publicId,
          issuedAt: row.lastFile!.createdAt,
          revoked: row.lastFile!.verifyRevoked,
          mailStatus: email?.status ?? null,
          mailSentAt: email?.sentAt ?? null,
          mailError: email?.error ?? null,
        };
      }),
    };
  }

  /**
   * Отозвать или вернуть проверку по конкретному выданному файлу.
   *
   * Нужно, когда документ выдан по ошибке: не тому человеку, с опечаткой
   * в фамилии, по неверному протоколу. Сам файл при этом остаётся —
   * он мог быть уже скачан и распечатан, и делать вид, что его не было,
   * бессмысленно. Меняется ответ страницы проверки: предъявленный
   * документ перестаёт подтверждаться.
   *
   * Возврат тоже нужен: отозвать по ошибке ничуть не труднее, чем выдать.
   *
   * Файл ищем через документ, а документ — через организацию: идентификатор
   * файла приходит из запроса, и без этой проверки чужой документ отзывался
   * бы по одному его номеру.
   */
  async setRevoked(orgId: string, documentId: string, fileId: string, revoked: boolean) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, orgId, documentId, kind: 'generated', deletedAt: null },
      select: { id: true, publicId: true, rows: { take: 1, select: { data: true } } },
    });
    if (!file) throw new NotFoundException('Документ не найден');

    await this.prisma.file.update({ where: { id: fileId }, data: { verifyRevoked: revoked } });

    const data = (file.rows[0]?.data ?? {}) as Record<string, string>;
    return { ok: true, revoked, name: data.name ?? '', publicId: file.publicId };
  }

  /**
   * Тот же реестр таблицей для Excel.
   *
   * Разделитель — точка с запятой, кодировка с меткой порядка байтов:
   * русский Excel открывает такой файл сразу, а обычный CSV с запятыми
   * складывает всё в один столбец и показывает кракозябры.
   */
  async csv(orgId: string, documentId: string): Promise<string> {
    const { items } = await this.list(orgId, documentId);

    // Колонки таблицы получателей у каждого документа свои, поэтому
    // собираем заголовок по фактическим данным, а не по жёсткому списку.
    const extra = [...new Set(items.flatMap((i) => Object.keys(i.fields)))].filter(
      (k) => k !== 'name' && k !== 'email',
    );

    const header = ['№', 'ФИО', 'Адрес почты', ...extra, 'Выдан', 'Проверочный код', 'Письмо'];
    const lines = [header.map(cell).join(';')];

    items.forEach((item, index) => {
      lines.push(
        [
          String(index + 1),
          item.name,
          item.email,
          ...extra.map((k) => item.fields[k] ?? ''),
          formatDate(item.issuedAt),
          item.publicId,
          mailLabel(item.mailStatus),
        ]
          .map(cell)
          .join(';'),
      );
    });

    // \uFEFF — метка порядка байтов, записана escape-последовательностью:
    // сам символ невидим, и в исходнике его легко потерять при правке.
    return `\uFEFF${lines.join('\r\n')}\r\n`;
  }
}

/**
 * Экранирование ячейки.
 *
 * Значение, начинающееся со знака равенства, плюса, минуса или собаки,
 * Excel считает формулой и выполняет. Фамилия «-Иванов» безобидна,
 * а вот подставленное в форму на сайте `=HYPERLINK(...)` — уже нет:
 * это выполнение чужого выражения на машине сотрудника федерации.
 * Поэтому такие значения предваряем апострофом.
 */
export function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(date);
}

function mailLabel(status: string | null): string {
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
