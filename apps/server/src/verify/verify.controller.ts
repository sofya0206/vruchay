import { Controller, Get, Logger, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { ReplacementService } from '../registry/replacement.service';
import { fileState, type FileState } from '../registry/file-state';
import { publicCodeSecret, type Env } from '../config/env';
import { hasValidTail, normalizePublicCode } from './public-code';
import { maskVerifyFields } from './name-mask';
import { verifyPath } from './verify-url';

/**
 * Идентификатор в адресе: UUID старых выпусков или короткий код новых.
 *
 * Длина ограничена до похода в разбор: адрес приходит снаружи, и разбирать
 * килобайт мусора ради ответа «не найдено» незачем.
 */
const idParam = new ZodValidationPipe(z.string().trim().min(1).max(64));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Почему документ не нашёлся — насколько это можно сказать, не раскрывая
 * ничего о чужих документах. Все три причины считаются по одному лишь
 * введённому коду и о базе не говорят ничего.
 *
 * - `malformed` — это не похоже ни на код, ни на UUID;
 * - `checksum` — похоже на код, но хвост не сходится: почти наверняка
 *   опечатка при вводе с бумаги;
 * - `unknown` — форма верна, а такого документа нет (или он не открыт
 *   для проверки).
 */
export type NotFoundReason = 'malformed' | 'checksum' | 'unknown';

/**
 * Сколько секунд ответ о действующем документе может жить в кэше.
 *
 * Минута: страницу открывают по QR и тут же закрывают, повторный визит
 * через минуту не должен снова ходить в базу. Дольше нельзя — отзыв
 * должен доезжать до страницы быстро, это и есть его смысл.
 */
const VALID_CACHE_SECONDS = 60;

/**
 * Проверка подлинности выданного документа.
 *
 * Открыта без входа: её открывает посторонний человек — работодатель,
 * приёмная комиссия, судья на соревновании, — у которого нет и не должно
 * быть учётной записи. Ровно ради этого страница и существует.
 *
 * Отвечает по существу как можно скупее. Показать «Иванов Пётр Ильич,
 * такое-то место» уместно: это ровно то, что напечатано на бумаге,
 * которую человек держит в руках. Показывать адрес почты, телефон
 * и остальные колонки таблицы нельзя: тогда перебор идентификаторов
 * превратился бы в выгрузку базы участников.
 */
@Controller('v1/verify')
@UseGuards(ThrottleGuard)
export class VerifyController {
  private readonly logger = new Logger(VerifyController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly replacement: ReplacementService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /*
   * Перебор ограничиваем по обращающемуся, а не по коду документа.
   *
   * Раньше счёт вёлся ключом `verify:<код>`: у каждого документа было своё
   * окно, и перебор разных кодов не задевал ни одного из них. Вдобавок ответ
   * счётчика никто не проверял — ограничение вызывалось и не действовало,
   * а каждая проверка ещё и писала в базу счётчик документа. То есть
   * посторонний мог без входа нагружать базу сколько угодно.
   *
   * Тридцати проверок в минуту с одного адреса хватает с запасом: страницу
   * открывает человек с бумагой в руках, а не список. Вместе с хвостом
   * кода (см. public-code.ts) это делает перебор бессмысленным: наугад
   * набранный код не сходится с базой почти никогда.
   */
  @Get(':id')
  @Throttle({ max: 30, timeWindow: '1 minute' })
  async check(@Param('id', idParam) id: string, @Res({ passthrough: true }) reply?: FastifyReply) {
    const lookup = this.lookupFor(id);
    if (!lookup.where) throw this.notFound(lookup.reason);

    const file = await this.prisma.file.findUnique({
      where: lookup.where,
      select: {
        id: true,
        orgId: true,
        publicId: true,
        publicCode: true,
        createdAt: true,
        deletedAt: true,
        expiresAt: true,
        verifyRevoked: true,
        revokedAt: true,
        revokedReasonPublic: true,
        pdfSha256: true,
        issuedData: true,
        rowId: true,
        replacedById: true,
        replacedByJobId: true,
        org: {
          select: {
            name: true,
            slug: true,
            publicPageEnabled: true,
            publicIndexable: true,
            verifiedIssuer: true,
            contactEmail: true,
            website: true,
            verifyNameMode: true,
          },
        },
        document: {
          select: {
            title: true,
            eventName: true,
            eventDate: true,
            verifyEnabled: true,
            verifyFields: true,
          },
        },
        row: { select: { data: true } },
        rows: {
          take: 1,
          select: { data: true },
        },
      },
    });

    // Отключённый и несуществующий отвечают одинаково: разные ответы
    // позволяли бы отличать «такого не было» от «был, но закрыт»,
    // а это сведения о чужих документах.
    if (!file || file.deletedAt || !file.document?.verifyEnabled) {
      throw this.notFound(lookup.reason);
    }

    /*
     * Отозванный — это 200 и красная страница, а не «не найдено».
     *
     * Раньше отзыв прятался за тем же отказом, что и несуществующий код:
     * так «был и отозван» нельзя было отличить от «не было никогда».
     * Но человек с бумагой в руках, получив «не найдено», решит, что
     * ошибся в коде, и будет пробовать снова, — а ему надо сказать
     * прямо: документ отозван, вот причина, вот куда обратиться.
     * Лишнего это не раскрывает: ответ получает только тот, кто уже
     * держит код, а перебор кодов не даёт ничего (см. public-code.ts).
     * Самого получателя на красной странице не называем: причина отзыва
     * может быть неприятной, и связывать её с фамилией на открытой
     * странице мы не вправе.
     */
    const replacedById = await this.replacement.settleOne(file);
    const state = fileState({
      verifyRevoked: file.verifyRevoked,
      replacedById,
      expiresAt: file.expiresAt,
    });
    const replacement =
      state === 'replaced' && replacedById
        ? await this.replacementFor(replacedById, file.orgId)
        : null;

    this.cacheHeaders(reply, state);
    await this.countCheck(file.id);

    /*
     * Снимок на момент выпуска, если он есть, иначе живая строка.
     *
     * Снимок важнее: строку потом правят — опечатку в фамилии перед
     * перевыпуском, — и страница не должна показывать имя, которого
     * нет на бумаге. У документов, выпущенных до появления снимка,
     * остаётся строка: другого источника у них нет.
     */
    const source = (file.issuedData ?? file.rows[0]?.data ?? file.row?.data ?? {}) as Record<
      string,
      string
    >;
    const allowed = (file.document.verifyFields as string[]) ?? [];
    // Только те поля, которые организация сама отметила показываемыми,
    // и только так, как разрешил эмитент. Пустой список — лишь факт.
    const picked = Object.fromEntries(allowed.filter((k) => source[k]).map((k) => [k, source[k]]));
    const fields = state === 'revoked' ? {} : maskVerifyFields(picked, file.org.verifyNameMode);

    const org = file.org;
    return {
      state,
      valid: state === 'valid',
      replaced: state === 'replaced',
      expired: state === 'expired',
      revoked: state === 'revoked',
      // Код показываем тот, что напечатан на бумаге: короткий у новых
      // выпусков, UUID у старых. По нему человек сверяет страницу с листом.
      code: file.publicCode ?? file.publicId,
      title: file.document.title,
      event: { name: file.document.eventName, date: file.document.eventDate },
      issuedAt: file.createdAt,
      expiresAt: file.expiresAt,
      fields,
      issuer: {
        name: org.name,
        verified: org.verifiedIssuer,
        publicPath: org.publicPageEnabled && org.slug ? `/org/${org.slug}` : null,
        contactEmail: org.contactEmail || null,
        website: org.website || null,
      },
      // Пускать ли поисковики: решение эмитента, а не наше.
      indexable: org.publicIndexable,
      // Отпечаток выпущенного файла — для сверки в браузере. Null у документов,
      // выпущенных до того, как отпечаток стали сохранять.
      sha256: file.pdfSha256,
      revokedAt: state === 'revoked' ? file.revokedAt : null,
      revokedReason: state === 'revoked' ? file.revokedReasonPublic || null : null,
      // Замену могли, в свою очередь, отозвать — тогда ссылки не даём:
      // вести человека на страницу, которая ответит «не найдено», хуже,
      // чем честно отправить его в выдавшую организацию.
      replacedBy: replacement,
    };
  }

  /**
   * Чем искать документ по тому, что пришло в адресе.
   *
   * UUID — прежний идентификатор, он напечатан в QR выданных раньше
   * документов. Короткий код принимаем в любом написании (см.
   * normalizePublicCode). Несошедшийся хвост кода в базу всё равно идёт:
   * хвост считается секретом, а секрет могли сменить после выпуска, —
   * и «похоже на опечатку» мы скажем только тому, у кого документа
   * заодно и не нашлось. Перебор от этого не выигрывает: наугад
   * набранный код не сходится с базой независимо от хвоста, а частоту
   * держит ограничение по адресу.
   */
  private lookupFor(id: string): {
    where: { publicId: string } | { publicCode: string } | null;
    reason: NotFoundReason;
  } {
    if (UUID.test(id)) return { where: { publicId: id.toLowerCase() }, reason: 'unknown' };

    const code = normalizePublicCode(id);
    if (!code) return { where: null, reason: 'malformed' };

    const secret = publicCodeSecret({
      PUBLIC_CODE_SECRET: this.config.get('PUBLIC_CODE_SECRET', { infer: true }),
      SESSION_SECRET: this.config.get('SESSION_SECRET', { infer: true }),
    });
    return {
      where: { publicCode: code },
      reason: hasValidTail(code, secret) ? 'unknown' : 'checksum',
    };
  }

  /**
   * «Не найдено» с причиной, которая ничего не говорит о чужих документах:
   * все три причины выводятся из одного лишь введённого кода.
   */
  private notFound(reason: NotFoundReason): NotFoundException {
    return new NotFoundException({ message: 'Документ не найден', reason });
  }

  /**
   * Кэш: действующий документ — на минуту, всё остальное — не хранить.
   *
   * Отозванный, истёкший и заменённый не кэшируются нигде: человек
   * открывает страницу, чтобы узнать текущее положение дел, и минутной
   * давности ответ «действителен» после отзыва — ровно то, чего отзыв
   * должен не допускать.
   */
  private cacheHeaders(reply: FastifyReply | undefined, state: FileState): void {
    if (!reply) return;
    reply.header(
      'cache-control',
      state === 'valid'
        ? `public, max-age=${VALID_CACHE_SECONDS}, stale-while-revalidate=${VALID_CACHE_SECONDS}`
        : 'no-store',
    );
  }

  /** Действующая замена — если она сама ещё действительна. */
  private async replacementFor(fileId: string, orgId: string) {
    const next = await this.prisma.file.findFirst({
      where: { id: fileId, orgId, deletedAt: null, verifyRevoked: false },
      select: {
        publicId: true,
        publicCode: true,
        createdAt: true,
        document: { select: { verifyEnabled: true } },
      },
    });
    if (!next?.document?.verifyEnabled) return null;
    return {
      code: next.publicCode ?? next.publicId,
      path: verifyPath(next),
      issuedAt: next.createdAt,
    };
  }

  /**
   * Обезличенный счётчик проверок.
   *
   * Растёт число на документе — и всё: ни адреса, ни устройства, ни
   * времени каждой отдельной проверки. Организации нужен ответ «сертификат
   * проверили 47 раз», и он же — её главный довод, что выданный документ
   * чего-то стоит. Собирать при этом сведения о проверяющих нельзя:
   * мы обработчик по поручению, а слежка в собственных интересах перевела бы
   * нас в операторы персональных данных со всей полнотой ответственности.
   *
   * Неудача счётчика не ломает проверку: подлинность документа не зависит
   * от того, удалось ли нам её сосчитать.
   */
  private async countCheck(fileId: string): Promise<void> {
    try {
      await this.prisma.file.update({
        where: { id: fileId },
        data: { verifyCount: { increment: 1 }, verifyLastAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(
        `Не удалось учесть проверку документа: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
