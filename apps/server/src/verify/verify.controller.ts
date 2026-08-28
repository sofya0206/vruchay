import { Controller, Get, Logger, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { ReplacementService } from '../registry/replacement.service';

const uuidParam = new ZodValidationPipe(z.string().uuid());

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
   * открывает человек с бумагой в руках, а не список.
   */
  @Get(':publicId')
  @Throttle({ max: 30, timeWindow: '1 minute' })
  async check(@Param('publicId', uuidParam) publicId: string) {
    const file = await this.prisma.file.findUnique({
      where: { publicId },
      select: {
        id: true,
        orgId: true,
        createdAt: true,
        verifyRevoked: true,
        rowId: true,
        replacedById: true,
        replacedByJobId: true,
        document: {
          select: { title: true, verifyEnabled: true, verifyFields: true },
        },
        row: { select: { data: true } },
        rows: {
          take: 1,
          select: { data: true },
        },
      },
    });

    // Отозванный, отключённый и несуществующий отвечают одинаково.
    // Разные ответы позволяли бы отличать «такого не было» от «был и отозван»,
    // а это сведения о чужих документах.
    if (!file || file.verifyRevoked || !file.document?.verifyEnabled) {
      throw new NotFoundException('Документ не найден');
    }

    /*
     * Заменённый документ отвечает иначе, чем отозванный, и это
     * осознанное исключение из правила выше.
     *
     * Перевыпуск — это исправленная опечатка в фамилии, а не проступок:
     * человеку с бумагой в руках надо не отказать, а показать, где взять
     * действующую. Скрывать замену значило бы отправлять его выяснять
     * отношения с организацией по поводу документа, который у неё
     * в порядке.
     *
     * Лишнего это не раскрывает: ответ получает только тот, кто уже держит
     * старый идентификатор, то есть кому этот документ и выдавали.
     */
    const replacedById = await this.replacement.settleOne(file);
    const replacement = replacedById ? await this.replacementFor(replacedById, file.orgId) : null;

    await this.countCheck(file.id);

    const data = (file.rows[0]?.data ?? file.row?.data ?? {}) as Record<string, string>;
    const allowed = (file.document.verifyFields as string[]) ?? [];
    // Только те поля, которые организация сама отметила показываемыми.
    // Пустой список — значит показываем лишь факт подлинности.
    const fields = Object.fromEntries(allowed.filter((k) => data[k]).map((k) => [k, data[k]]));

    if (replacedById) {
      return {
        valid: false as const,
        replaced: true as const,
        title: file.document.title,
        issuedAt: file.createdAt,
        fields,
        // Замену могли, в свою очередь, отозвать — тогда ссылки не даём:
        // вести человека на страницу, которая ответит «не найдено», хуже,
        // чем честно отправить его в выдавшую организацию.
        replacedBy: replacement,
      };
    }

    return {
      valid: true as const,
      replaced: false as const,
      title: file.document.title,
      issuedAt: file.createdAt,
      fields,
    };
  }

  /** Действующая замена — если она сама ещё действительна. */
  private async replacementFor(fileId: string, orgId: string) {
    const next = await this.prisma.file.findFirst({
      where: { id: fileId, orgId, deletedAt: null, verifyRevoked: false },
      select: {
        publicId: true,
        createdAt: true,
        document: { select: { verifyEnabled: true } },
      },
    });
    if (!next?.document?.verifyEnabled) return null;
    return { publicId: next.publicId, issuedAt: next.createdAt };
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
