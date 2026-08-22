import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Throttle } from '../common/throttle.decorator';
import { ThrottleGuard } from '../common/throttle.guard';
import { uuidSchema } from '../documents/documents.dto';
import { TildaService } from './tilda.service';
import {
  confirmSchema,
  ConfirmDto,
  linkCodeSchema,
  myConfirmSchema,
  MyConfirmDto,
  myListSchema,
  MyListDto,
  submitSchema,
  SubmitDto,
} from './tilda.dto';
import { TildaMyService } from './tilda-my.service';
import { buildTildaScript, TILDA_STYLES } from './tilda-snippet';
import { parseTildaForm } from './tilda-create';

const uuidParam = new ZodValidationPipe(uuidSchema);
const linkCodeParam = new ZodValidationPipe(linkCodeSchema);
/** Разбор идёт до проверки, поэтому схема применяется вручную, а не декоратором. */
const submitBody = new ZodValidationPipe(submitSchema);

/**
 * Страница после нажатия ссылки в письме. Своя разметка, а не приложение:
 * сюда приходят с чужого сайта, и грузить ради одной фразы весь кабинет
 * незачем. Текст статический — пользовательских данных в нём нет.
 */
function linkPage(title: string, text: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbfaf7;
font-family:system-ui,-apple-system,sans-serif;color:#16211c}
.c{max-width:380px;padding:28px;text-align:center}h1{font-size:20px;margin:0 0 8px}
p{font-size:15px;color:#5f6b64;line-height:1.45;margin:0}</style></head>
<body><div class="c"><h1>${title}</h1><p>${text}</p></div></body></html>`;
}

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
  private readonly logger = new Logger(TildaPublicController.name);

  constructor(
    private readonly tilda: TildaService,
    private readonly my: TildaMyService,
  ) {}

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
  // Тильда считает отправку удавшейся только по двухсотому ответу.
  @HttpCode(200)
  // Тильда шлёт со своих серверов, и все её сайты приходят с одних адресов:
  // лимит по адресу здесь общий на всех клиентов сразу. От накрутки
  // защищает суточный предел интеграции, а этот порог — только от шторма.
  @Throttle({ max: 120, timeWindow: '5 minutes' })
  async create(@Body() body: unknown, @Req() req: FastifyRequest) {
    const fields = await formFields(req, body);

    // Тильда при подключении шлёт проверочный запрос `test=test` без
    // остальных полей и принимает адрес только по двухсотому ответу.
    if ('test' in fields && !('secure' in fields)) {
      this.logger.log(
        `Проверочный запрос Тильды: источник «${req.headers.origin ?? req.headers.referer ?? 'не указан'}», ` +
          `агент «${(req.headers['user-agent'] ?? '').slice(0, 80)}», поля: ${Object.keys(fields).join(', ')}`,
      );
      return { ok: true };
    }

    const parsed = parseTildaForm(fields);

    if (parsed.documentId.toLowerCase() === 'all') {
      // Перечень документов не уложить в ответ форме — его показывает
      // наш скрипт на странице, и подключить его для этого придётся.
      throw new BadRequestException(
        'Список документов показывает скрипт на странице: подключите код из кабинета',
      );
    }

    const dto = submitBody.transform(parsed, { type: 'body' }) as SubmitDto;

    return this.tilda.submit(dto, {
      origin: req.headers.origin,
      referer: req.headers.referer,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      directPost: true,
    });
  }

  /**
   * Подтверждение по ссылке из письма — для заявок, отправленных прямо
   * на наш адрес. Отвечает страницей, а не JSON: на неё приходят из почты.
   */
  @Get('tilda/confirm/:requestId/:code')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  @Throttle({ max: 15, timeWindow: '10 minutes' })
  async confirmByLink(
    @Param('requestId', uuidParam) requestId: string,
    @Param('code', linkCodeParam) code: string,
  ): Promise<string> {
    try {
      await this.tilda.confirm(requestId, code);
      return linkPage('Адрес подтверждён', 'Документ готовится и придёт на эту почту в течение пары минут.');
    } catch (err) {
      const message =
        err instanceof BadRequestException
          ? (err.getResponse() as { message?: string }).message ?? 'Не удалось подтвердить адрес'
          : 'Ссылка уже использована или устарела. Если вы её уже нажимали — документ в пути, проверьте почту';
      return linkPage('Не получилось', message);
    }
  }

  // ─── Мои документы ──────────────────────────────────────────────────────

  @Post('tilda/my')
  @Throttle({ max: 10, timeWindow: '5 minutes' })
  myStart(@Body(new ZodValidationPipe(myListSchema)) dto: MyListDto, @Req() req: FastifyRequest) {
    return this.my.start(dto, { origin: req.headers.origin, referer: req.headers.referer });
  }

  @Post('tilda/my/confirm')
  @Throttle({ max: 15, timeWindow: '10 minutes' })
  myConfirm(@Body(new ZodValidationPipe(myConfirmSchema)) dto: MyConfirmDto) {
    return this.my.confirm(dto.listId, dto.code);
  }

  @Get('tilda/my/:listId')
  @Throttle({ max: 60, timeWindow: '10 minutes' })
  myList(@Param('listId', uuidParam) listId: string) {
    return this.my.list(listId);
  }

  @Get('tilda/my/:listId/download/:requestId')
  @Throttle({ max: 60, timeWindow: '10 minutes' })
  async myDownload(
    @Param('listId', uuidParam) listId: string,
    @Param('requestId', uuidParam) requestId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.my.download(listId, requestId);
    await reply
      .header('content-type', file.mime)
      .header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      )
      .header('cache-control', 'no-store')
      .send(file.stream);
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

/**
 * Поля формы из тела запроса — как бы Тильда его ни прислала.
 *
 * Обычно это `application/x-www-form-urlencoded`, и тело уже разобрано.
 * Но форму могут отправить и как `multipart/form-data` — тогда разобранного
 * тела нет, а поля надо собрать по частям. Файлы пропускаем: в заявке
 * им взяться неоткуда, а читать их целиком — лишняя нагрузка.
 */
async function formFields(req: FastifyRequest, body: unknown): Promise<Record<string, unknown>> {
  if (body && typeof body === 'object' && Object.keys(body as object).length > 0) {
    return body as Record<string, unknown>;
  }
  if (typeof req.isMultipart === 'function' && req.isMultipart()) {
    const out: Record<string, unknown> = {};
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (Object.keys(out).length < 40) out[part.fieldname] = part.value;
      } else {
        // Поток файла надо дочитать, иначе следующая часть не придёт
        // и запрос повиснет до таймаута.
        part.file.resume();
      }
    }
    return out;
  }
  return {};
}
