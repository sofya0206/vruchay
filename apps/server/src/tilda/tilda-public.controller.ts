import { Body, Controller, Get, Header, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { uuidSchema } from '../documents/documents.dto';
import { TildaService } from './tilda.service';
import { confirmSchema, ConfirmDto, submitSchema, SubmitDto } from './tilda.dto';
import { buildTildaScript, TILDA_STYLES } from './tilda-snippet';
import { parseTildaForm } from './tilda-create';

const uuidParam = new ZodValidationPipe(uuidSchema);
/** Разбор идёт до проверки, поэтому схема применяется вручную, а не декоратором. */
const submitBody = new ZodValidationPipe(submitSchema);

/**
 * Публичные эндпоинты форм. Сессии здесь нет — это открытая часть сервиса,
 * доступная любому посетителю сайта клиента.
 *
 * Ограничение частоты обязательно на каждом маршруте: без сессии единственный
 * различитель — адрес обращения.
 */
@Controller('v1')
@UseGuards(ThrottleGuard)
export class TildaPublicController {
  constructor(private readonly tilda: TildaService) {}

  /*
   * Косая черта в конце адреса принимается наравне с её отсутствием —
   * это делает общая настройка ignoreTrailingSlash в main.ts, а не
   * отдельные маршруты здесь: Fastify считает `путь` и `путь/` одним
   * и тем же маршрутом и на попытку описать оба падает при запуске.
   */
  @Get('tilda-css/:token')
  @Header('content-type', 'text/css; charset=utf-8')
  @Header('cache-control', 'public, max-age=86400')
  css(): string {
    return TILDA_STYLES;
  }

  @Get('tilda-js/:token')
  @Header('content-type', 'application/javascript; charset=utf-8')
  @Header('cache-control', 'public, max-age=300')
  async js(@Param('token', uuidParam) token: string, @Req() req: FastifyRequest): Promise<string> {
    const config = await this.tilda.publicConfig(token);
    const base = `${req.protocol}://${req.headers.host ?? ''}`;
    return buildTildaScript(base, config);
  }

  @Post('tilda/submit')
  @Throttle({ max: 10, timeWindow: '5 minutes' })
  async submit(
    @Body(new ZodValidationPipe(submitSchema)) dto: SubmitDto,
    @Req() req: FastifyRequest,
  ) {
    return this.tilda.submit(dto, {
      origin: req.headers.origin,
      referer: req.headers.referer,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /**
   * Приём формы прямо с сайта клиента, без нашего скрипта на странице.
   *
   * Адрес вписывается в Тильде в «Свой скрипт для приёма данных», и дальше
   * страницу трогать не нужно. Тело приходит как обычная форма, а не JSON,
   * и с приставками `mask_` у полей — разбирает его parseTildaForm.
   *
   * Путь отдельный от `tilda/submit` намеренно: тот принимает JSON от нашего
   * скрипта, у которого источник в заголовках есть всегда, и смягчать там
   * проверку источника ради этого случая было бы ослаблением рабочего пути.
   */
  @Post('tilda-create')
  @Throttle({ max: 10, timeWindow: '5 minutes' })
  async create(@Body() body: unknown, @Req() req: FastifyRequest) {
    const parsed = parseTildaForm((body ?? {}) as Record<string, unknown>);
    const dto = submitBody.transform(parsed, { type: 'body' }) as SubmitDto;

    return this.tilda.submit(dto, {
      origin: req.headers.origin,
      referer: req.headers.referer,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      directPost: true,
    });
  }

  @Post('tilda/confirm')
  @Throttle({ max: 15, timeWindow: '10 minutes' })
  confirm(@Body(new ZodValidationPipe(confirmSchema)) dto: ConfirmDto) {
    return this.tilda.confirm(dto.requestId, dto.code);
  }

  @Get('tilda/download/:requestId')
  @Throttle({ max: 20, timeWindow: '10 minutes' })
  async download(
    @Param('requestId', uuidParam) requestId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.tilda.download(requestId);
    await reply
      .header('content-type', file.mime)
      // filename* с кодировкой: в имени файла русское имя участника.
      .header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      )
      .header('cache-control', 'no-store')
      .send(file.stream);
  }

  @Get('tilda/status/:requestId')
  // Опрос статуса идёт каждую секунду, пока готовится документ.
  @Throttle({ max: 120, timeWindow: '5 minutes' })
  status(@Param('requestId', uuidParam) requestId: string) {
    return this.tilda.status(requestId);
  }
}
