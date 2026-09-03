import { Injectable, NotFoundException } from '@nestjs/common';
import {
  sheetLayout,
  type BatchValidation,
  type QuotaVerdict,
  type SheetLayout, issuedAtOf, } from '@gramota/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OrgService } from '../org/org.service';
import { validateBatch, type ValidationRow } from './validate-batch';
import type { ExcludeDto, FixManyDto, ValidateBatchDto } from './validation.dto';

/**
 * Сколько строк проверка разбирает за раз.
 *
 * Совпадает с пределом импорта (recipients.dto.ts) и чтения таблицы
 * (RecipientsService.getTable) — но не с выпуском: выпуск берёт все
 * отмеченные строки, сколько бы их ни было. Поэтому на документе крупнее
 * предела разбор обязан сказать вслух, что часть строк он не смотрел.
 * Молчаливое «5000 чистых» на списке из шести тысяч — это тысяча
 * непроверенных грамот, о которых человек узнает от получателей.
 */
export const MAX_VALIDATED_ROWS = 5000;

/**
 * Проверка списка получателей до выпуска.
 *
 * Всё, что здесь делается с базой, отфильтровано по orgId из сессии:
 * чужой документ отвечает «не найден», а не «нет доступа», — иначе ответ
 * подтверждал бы, что документ с таким идентификатором существует.
 */
@Injectable()
export class ValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly org: OrgService,
  ) {}

  /** Документ вместе с листами. Отсутствие прав неотличимо от отсутствия документа. */
  private async loadDocument(orgId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, orgId, deletedAt: null },
      include: {
        org: { select: { name: true } },
        sheets: { orderBy: { position: 'asc' }, select: { layout: true } },
      },
    });
    if (!doc) throw new NotFoundException('Документ не найден');
    return doc;
  }

  async validate(
    orgId: string,
    documentId: string,
    dto: ValidateBatchDto,
  ): Promise<BatchValidation> {
    const doc = await this.loadDocument(orgId, documentId);

    const scope = {
      documentId,
      ...(dto.scope === 'checked' ? { checked: true } : {}),
    };

    // Считаем отдельно и без предела: именно столько строк уйдёт в выпуск,
    // и именно от этого числа считается остаток квоты.
    const inScope = await this.prisma.recipientRow.count({ where: scope });

    const rows = await this.prisma.recipientRow.findMany({
      where: scope,
      orderBy: { position: 'asc' },
      take: MAX_VALIDATED_ROWS,
      select: {
        id: true,
        position: true,
        data: true,
        // Дата прошлой выдачи берётся из живого файла: удалённый экземпляр
        // повторной выдачей не считается — его же и переделывают.
        lastFile: { select: { createdAt: true, deletedAt: true } },
      },
    });

    /*
     * Макет читаем через ту же схему, что и редактор.
     *
     * Он лежит в базе как Json и мог быть записан прежней версией формата.
     * Разбор без схемы уронил бы проверку на старом документе, а проверка
     * обязана работать именно на них — в них и накопились проблемы.
     */
    const sheets: SheetLayout[] = [];
    for (const sheet of doc.sheets) {
      const parsed = sheetLayout.safeParse(sheet.layout);
      if (parsed.success) sheets.push(parsed.data);
    }

    /*
     * Остаток пробы берём у OrgService — той же службы, что показывает его
     * на главной кабинета. Отмеченным считаем всё, что уйдёт в выпуск,
     * а не только разобранное: иначе на списке крупнее предела проверка
     * обещала бы запас, которого нет.
     */
    const usage = await this.org.usage(orgId);
    const quota: QuotaVerdict = {
      plan: usage.plan,
      used: usage.used,
      limit: usage.limit,
      left: usage.left,
      adding: inScope,
    };

    const input = {
      rows: rows.map<ValidationRow>((row) => ({
        id: row.id,
        position: row.position,
        data: (row.data ?? {}) as Record<string, string>,
        issuedAt: row.lastFile && !row.lastFile.deletedAt ? row.lastFile.createdAt : null,
      })),
      sheets,
      columns: await this.columnNames(documentId),
      quota,
      document: {
        orgName: doc.org?.name ?? '',
        eventName: doc.eventName,
        eventDate: doc.eventDate,
        eventPlace: doc.eventPlace,
        eventHours: doc.eventHours,
      },
      issuedAt: issuedAtOf(doc.issueDate),
    };

    const report = validateBatch(input);

    /*
     * Непроверенный хвост. Выпуск возьмёт все отмеченные строки, а разбор
     * дошёл только до предела — и человек обязан узнать об этом здесь,
     * а не когда получатели начнут спрашивать про обрезанные фамилии.
     */
    if (inScope > rows.length) {
      const rest = inScope - rows.length;
      report.caveats.unshift(
        `Проверены первые ${rows.length} ${plural(rows.length, 'строка', 'строки', 'строк')} ` +
          `из ${inScope}: за один раз разбираем не больше ${MAX_VALIDATED_ROWS}. ` +
          `Остальные ${rest} ${plural(rest, 'строка', 'строки', 'строк')} не проверялись, ` +
          `но в выпуск попадут — разделите список или снимите с них отметки.`,
      );
    }

    if (doc.sheets.length !== sheets.length) {
      report.caveats.push(
        `Не удалось прочитать ${doc.sheets.length - sheets.length} из ${doc.sheets.length} листов — ` +
          'они собраны прежней версией редактора и не проверялись',
      );
    }

    return report;
  }

  private async columnNames(documentId: string): Promise<string[]> {
    const columns = await this.prisma.recipientColumn.findMany({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: { name: true },
    });
    return columns.map((c) => c.name);
  }

  /**
   * Правка ячеек прямо из разбора — по одной или сразу во многих строках.
   *
   * Идёт одной транзакцией: «применить ко всем похожим» меняет сотни строк,
   * и половина применённых исправлений хуже, чем ни одного, — по половине
   * непонятно, что уже сделано, а что ещё нет.
   */
  async fix(orgId: string, documentId: string, dto: FixManyDto): Promise<{ updated: number }> {
    await this.loadDocument(orgId, documentId);

    const ids = [...new Set(dto.fixes.map((f) => f.rowId))];
    const rows = await this.prisma.recipientRow.findMany({
      where: { id: { in: ids }, documentId },
      select: { id: true, data: true },
    });

    // Строка не из этого документа молча выпадает из правки: сообщать,
    // что она существует, но чужая, — значит подтверждать её существование.
    const known = new Map(rows.map((r) => [r.id, (r.data ?? {}) as Record<string, string>]));

    const patched = new Map<string, Record<string, string>>();
    for (const fix of dto.fixes) {
      const current = patched.get(fix.rowId) ?? known.get(fix.rowId);
      if (!current) continue;
      patched.set(fix.rowId, { ...current, [fix.column]: fix.value });
    }

    if (patched.size === 0) return { updated: 0 };

    await this.prisma.$transaction(
      [...patched].map(([id, data]) =>
        this.prisma.recipientRow.update({ where: { id }, data: { data } }),
      ),
    );

    return { updated: patched.size };
  }

  /**
   * Снять отметку со строк — «исключить» и «выпустить только чистые».
   *
   * Именно снять отметку, а не удалить: исключённая строка остаётся в таблице
   * со своими данными, и человек вернётся к ней, когда разберётся. Удаление
   * здесь было бы необратимой потерей чужой работы ради одной кнопки.
   */
  async exclude(orgId: string, documentId: string, dto: ExcludeDto): Promise<{ excluded: number }> {
    await this.loadDocument(orgId, documentId);
    const { count } = await this.prisma.recipientRow.updateMany({
      where: { id: { in: dto.rowIds }, documentId },
      data: { checked: false },
    });
    return { excluded: count };
  }
}

/** Русское склонение числительных для оговорок отчёта. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
