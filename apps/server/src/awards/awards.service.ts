import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AwardRule as DbAwardRule, AwardRuleSet as DbAwardRuleSet } from '@prisma/client';
import {
  applyAwardRules,
  awardRuleSet as awardRuleSetSchema,
  defaultProtocolRules,
  DEFAULT_RULE_SET_NAME,
  lintRuleSet,
  AWARD_RULES_SCHEMA_VERSION,
} from '@gramota/shared';
import type { AwardOutput, AwardPlan, AwardRule, AwardRuleSet } from '@gramota/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRuleSetDto, RuleInputDto, UpdateRuleSetDto } from './awards.dto';

type DbRuleSetWithRules = DbAwardRuleSet & { rules: DbAwardRule[] };

/** Больше строк за раз всё равно не переваривает генерация — см. importSchema. */
const MAX_ROWS = 5000;

@Injectable()
export class AwardsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Набор ищем сразу с фильтром по организации. Чужой набор отдаём как
   * ненайденный, а не как запрещённый: 403 подтвердил бы, что такой
   * идентификатор существует.
   */
  private async loadRuleSet(orgId: string, ruleSetId: string): Promise<DbRuleSetWithRules> {
    const set = await this.prisma.awardRuleSet.findFirst({
      where: { id: ruleSetId, orgId, deletedAt: null },
      include: { rules: { orderBy: { position: 'asc' } } },
    });
    if (!set) throw new NotFoundException('Набор правил не найден');
    return set;
  }

  private async assertDocument(orgId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, orgId, deletedAt: null },
      select: { id: true, ruleSetId: true },
    });
    if (!doc) throw new NotFoundException('Документ не найден');
    return doc;
  }

  /**
   * Шаблоны обязаны принадлежать той же организации.
   *
   * Без этой проверки правило со ссылкой на чужой документ показало бы
   * его название в превью — а название материала само по себе сведения
   * о клиенте: «Диплом чемпионата области по самбо» рассказывает о чужой
   * федерации больше, чем ей хотелось бы.
   */
  private async assertTemplatesOwned(orgId: string, rules: RuleInputDto[]): Promise<void> {
    const ids = [
      ...new Set(rules.flatMap((r) => r.outputs.map((o: AwardOutput) => o.templateDocumentId))),
    ];
    if (!ids.length) return;

    const found = await this.prisma.document.findMany({
      where: { id: { in: ids }, orgId, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('Выбранный шаблон недоступен: он удалён или лежит в корзине');
    }
  }

  // ─── Наборы правил ──────────────────────────────────────────────────────

  async list(orgId: string) {
    const sets = await this.prisma.awardRuleSet.findMany({
      where: { orgId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      include: { _count: { select: { rules: true, documents: true } } },
    });
    return sets.map((s) => ({
      id: s.id,
      name: s.name,
      groupColumn: s.groupColumn,
      statusColumn: s.statusColumn,
      isDefault: s.isDefault,
      schemaVersion: s.schemaVersion,
      updatedAt: s.updatedAt,
      ruleCount: s._count.rules,
      /** На скольких соревнованиях уже применён — видно, что набор рабочий. */
      documentCount: s._count.documents,
    }));
  }

  async get(orgId: string, ruleSetId: string): Promise<AwardRuleSet> {
    return toContract(await this.loadRuleSet(orgId, ruleSetId));
  }

  async create(orgId: string, dto: CreateRuleSetDto): Promise<AwardRuleSet> {
    await this.assertTemplatesOwned(orgId, dto.rules);

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await clearDefault(tx, orgId);
      return tx.awardRuleSet.create({
        data: {
          orgId,
          name: dto.name,
          groupColumn: dto.groupColumn,
          statusColumn: dto.statusColumn,
          isDefault: dto.isDefault,
          schemaVersion: AWARD_RULES_SCHEMA_VERSION,
          rules: { create: dto.rules.map(toRuleRow) },
        },
        include: { rules: { orderBy: { position: 'asc' } } },
      });
    });
    return toContract(created);
  }

  /**
   * Правила пересоздаются целиком, а не правятся по одному.
   *
   * Порядок правил — это и есть их приоритет, а он меняется при
   * перетаскивании любого правила. Точечные правки заставили бы клиента
   * присылать перенумерацию половины списка и держать её в согласии
   * с уникальным индексом (ruleSetId, position).
   */
  async update(orgId: string, ruleSetId: string, dto: UpdateRuleSetDto): Promise<AwardRuleSet> {
    await this.loadRuleSet(orgId, ruleSetId);
    if (dto.rules) await this.assertTemplatesOwned(orgId, dto.rules);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await clearDefault(tx, orgId, ruleSetId);
      if (dto.rules) {
        await tx.awardRule.deleteMany({ where: { ruleSetId } });
      }
      return tx.awardRuleSet.update({
        where: { id: ruleSetId },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.groupColumn === undefined ? {} : { groupColumn: dto.groupColumn }),
          ...(dto.statusColumn === undefined ? {} : { statusColumn: dto.statusColumn }),
          ...(dto.isDefault === undefined ? {} : { isDefault: dto.isDefault }),
          ...(dto.rules ? { rules: { create: dto.rules.map(toRuleRow) } } : {}),
        },
        include: { rules: { orderBy: { position: 'asc' } } },
      });
    });
    return toContract(updated);
  }

  /**
   * Удаление мягкое: набор мог применяться на прошлых соревнованиях,
   * и реестр выданного должен уметь объяснить, по какому правилу
   * выдан документ, даже когда набором больше не пользуются.
   */
  async remove(orgId: string, ruleSetId: string) {
    await this.loadRuleSet(orgId, ruleSetId);
    await this.prisma.awardRuleSet.update({
      where: { id: ruleSetId },
      data: { deletedAt: new Date(), isDefault: false },
    });
    return { ok: true };
  }

  /** Копия набора — «взять как на прошлом соревновании и поправить». */
  async duplicate(orgId: string, ruleSetId: string): Promise<AwardRuleSet> {
    const source = await this.loadRuleSet(orgId, ruleSetId);
    const copy = await this.prisma.awardRuleSet.create({
      data: {
        orgId,
        name: `${source.name} — копия`.slice(0, 200),
        groupColumn: source.groupColumn,
        statusColumn: source.statusColumn,
        schemaVersion: source.schemaVersion,
        isDefault: false,
        rules: {
          create: source.rules.map((r) => ({
            // Идентификаторы новые: у копии своя жизнь, и снимки планов
            // прошлых выпусков должны ссылаться на исходные правила.
            id: randomUUID(),
            position: r.position,
            enabled: r.enabled,
            label: r.label,
            conditions: r.conditions ?? [],
            match: r.match,
            action: r.action,
            outputs: r.outputs ?? [],
          })),
        },
      },
      include: { rules: { orderBy: { position: 'asc' } } },
    });
    return toContract(copy);
  }

  // ─── Привязка к соревнованию ────────────────────────────────────────────

  async attach(orgId: string, documentId: string, ruleSetId: string | null) {
    await this.assertDocument(orgId, documentId);
    if (ruleSetId) await this.loadRuleSet(orgId, ruleSetId);

    await this.prisma.document.update({ where: { id: documentId }, data: { ruleSetId } });
    return { ok: true, ruleSetId };
  }

  // ─── Раскладка ──────────────────────────────────────────────────────────

  /**
   * Превью раскладки: что выйдет, если выпустить прямо сейчас.
   *
   * Считается на сервере, хотя тот же движок есть и в браузере: перед
   * выпуском решение принимает сервер, и показывать человеку одно, а
   * выпускать другое нельзя. Клиентский расчёт нужен для мгновенной
   * реакции, пока правила ещё правят.
   */
  async preview(
    orgId: string,
    documentId: string,
    draft?: CreateRuleSetDto,
  ): Promise<AwardPreviewResult> {
    const doc = await this.assertDocument(orgId, documentId);

    let contract: AwardRuleSet;
    if (draft) {
      await this.assertTemplatesOwned(orgId, draft.rules);
      contract = draftToContract(draft);
    } else {
      if (!doc.ruleSetId) {
        throw new BadRequestException(
          'К этому соревнованию не привязан набор правил — выберите его в разделе «Правила»',
        );
      }
      contract = toContract(await this.loadRuleSet(orgId, doc.ruleSetId));
    }

    const [rows, totalRows, nameColumn] = await Promise.all([
      this.prisma.recipientRow.findMany({
        where: { documentId, checked: true },
        orderBy: { position: 'asc' },
        take: MAX_ROWS,
        select: { id: true, position: true, data: true },
      }),
      this.prisma.recipientRow.count({ where: { documentId, checked: true } }),
      this.firstNameColumn(documentId),
    ]);

    const templateTitles = await this.templateTitles(orgId, contract);

    const plan = applyAwardRules({
      ruleSet: contract,
      rows: rows.map((r) => ({
        id: r.id,
        position: r.position,
        data: (r.data ?? {}) as Record<string, string>,
      })),
      templateTitles,
      nameColumn,
    });

    const problems = lintRuleSet(contract);
    /*
     * Обрезку показываем явно. Молча посчитанные первые 5000 строк дают
     * на файле в 6000 строк превью «строк в протоколе — 5000»: число
     * выглядит правдоподобно, сверить его не с чем, и тысяча человек
     * остаётся без документов до самого награждения.
     */
    if (totalRows > rows.length) {
      problems.push(
        `Отмечено строк: ${totalRows}, в раскладку взяты первые ${rows.length}. ` +
          `Остальные ${totalRows - rows.length} не попадут ни в документы, ни в отчёт — ` +
          'разделите протокол на несколько материалов',
      );
    }

    return { plan, problems };
  }

  /**
   * Заготовка набора по колонкам уже загруженной таблицы.
   *
   * Ничего не сохраняет: конструктор показывает предложенное, человек
   * дописывает шаблоны и сохраняет сам. Молча заведённый в базе набор
   * пришлось бы потом искать и удалять тому, кто просто посмотрел.
   */
  async suggest(orgId: string, documentId: string, name?: string): Promise<AwardRuleSet> {
    await this.assertDocument(orgId, documentId);
    const columns = await this.prisma.recipientColumn.findMany({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: { name: true },
    });
    const names = new Set(columns.map((c) => c.name));
    const pick = (...candidates: string[]) => candidates.find((c) => names.has(c)) ?? '';

    const placeColumn = pick('place', 'rank');
    const statusColumn = pick('status', 'result_status');

    return {
      id: randomUUID(),
      name: name ?? DEFAULT_RULE_SET_NAME,
      schemaVersion: AWARD_RULES_SCHEMA_VERSION,
      groupColumn: pick('category', 'group', 'age_group'),
      statusColumn,
      rules: defaultProtocolRules({ placeColumn, statusColumn, makeId: randomUUID }),
    };
  }

  /** Документы организации, годные в шаблоны: их выбирают в конструкторе. */
  async templates(orgId: string) {
    return this.prisma.document.findMany({
      where: { orgId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { id: true, title: true },
    });
  }

  /**
   * Названия шаблонов для плана — только свои. Идентификатор чужого или
   * удалённого документа в словарь не попадёт, и движок отдаст это
   * замечанием «шаблон недоступен».
   */
  private async templateTitles(
    orgId: string,
    set: AwardRuleSet,
  ): Promise<Record<string, string>> {
    const ids = [
      ...new Set(set.rules.flatMap((r) => r.outputs.map((o) => o.templateDocumentId))),
    ];
    if (!ids.length) return {};

    const docs = await this.prisma.document.findMany({
      where: { id: { in: ids }, orgId, deletedAt: null },
      select: { id: true, title: true },
    });
    return Object.fromEntries(docs.map((d) => [d.id, d.title]));
  }

  /**
   * Колонка с ФИО. Берём `name`, если она есть, иначе первую по порядку:
   * без имени отчёт «строки без правила» превращается в список
   * идентификаторов, по которому человек ничего не найдёт.
   */
  private async firstNameColumn(documentId: string): Promise<string> {
    const columns = await this.prisma.recipientColumn.findMany({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: { name: true },
    });
    if (columns.some((c) => c.name === 'name')) return 'name';
    return columns[0]?.name ?? 'name';
  }
}

export interface AwardPreviewResult {
  plan: AwardPlan;
  /** Что не так с самим набором правил, а не со строками. */
  problems: string[];
}

/** Позиция берётся из порядка в списке: он и есть приоритет правила. */
function toRuleRow(rule: RuleInputDto, index: number) {
  return {
    id: rule.id,
    position: index,
    enabled: rule.enabled,
    label: rule.label,
    conditions: rule.conditions,
    match: rule.match,
    action: rule.action,
    outputs: rule.outputs,
  };
}

/**
 * Строки базы → общий контракт.
 *
 * Прогоняем через Zod-схему, а не приводим типом: `conditions` и `outputs`
 * лежат в JSON, и запись, сделанная прошлой версией формата, обязана
 * споткнуться здесь, а не посреди раскладки трёхсот человек.
 */
function toContract(set: DbRuleSetWithRules): AwardRuleSet {
  return awardRuleSetSchema.parse({
    id: set.id,
    name: set.name,
    schemaVersion: set.schemaVersion,
    groupColumn: set.groupColumn,
    statusColumn: set.statusColumn,
    rules: set.rules.map((r) => ({
      id: r.id,
      position: r.position,
      enabled: r.enabled,
      label: r.label,
      match: r.match,
      conditions: r.conditions ?? [],
      action: r.action,
      outputs: r.outputs ?? [],
    })),
  });
}

/** Несохранённый набор из тела запроса → контракт для расчёта превью. */
function draftToContract(draft: CreateRuleSetDto): AwardRuleSet {
  return awardRuleSetSchema.parse({
    id: randomUUID(),
    name: draft.name,
    schemaVersion: AWARD_RULES_SCHEMA_VERSION,
    groupColumn: draft.groupColumn,
    statusColumn: draft.statusColumn,
    rules: draft.rules.map((r, index): AwardRule => ({ ...r, position: index })),
  });
}

/** По умолчанию набор может быть только один — иначе «по умолчанию» ничего не значит. */
async function clearDefault(
  tx: Prisma.TransactionClient,
  orgId: string,
  exceptId?: string,
): Promise<void> {
  await tx.awardRuleSet.updateMany({
    where: { orgId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isDefault: false },
  });
}
