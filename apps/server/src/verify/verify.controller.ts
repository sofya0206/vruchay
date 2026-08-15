import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitService } from '../common/rate-limit.service';

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
export class VerifyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get(':publicId')
  async check(@Param('publicId', uuidParam) publicId: string) {
    // Идентификатор случайный и его не подобрать, но перебор всё равно
    // ограничиваем: без этого страница стала бы способом выяснять,
    // какие документы вообще существуют.
    await this.rateLimit.hit(`verify:${publicId}`, 60_000, 30);

    const file = await this.prisma.file.findUnique({
      where: { publicId },
      select: {
        createdAt: true,
        verifyRevoked: true,
        document: {
          select: { title: true, verifyEnabled: true, verifyFields: true },
        },
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

    const data = (file.rows[0]?.data ?? {}) as Record<string, string>;
    const allowed = (file.document.verifyFields as string[]) ?? [];

    return {
      valid: true,
      title: file.document.title,
      issuedAt: file.createdAt,
      // Только те поля, которые организация сама отметила показываемыми.
      // Пустой список — значит показываем лишь факт подлинности.
      fields: Object.fromEntries(
        allowed.filter((k) => data[k]).map((k) => [k, data[k]]),
      ),
    };
  }
}
