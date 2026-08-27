import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySecureSession from '@fastify/secure-session';
import fastifyMultipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import { MAX_IMAGE_BYTES } from './common/image-type';
import { MAX_IMPORT_BODY_BYTES } from './recipients/recipients.dto';
import { AppModule } from './app.module';
import { validateEnv } from './config/env';
import { registerPublicCors } from './tilda/public-cors';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Единственный маршрут, которому нужно тело больше мегабайта. */
const IMPORT_ROUTE = '/api/documents/:id/recipients/import';

async function bootstrap() {
  const env = validateEnv(process.env);
  const isProd = env.NODE_ENV === 'production';

  const adapter = new FastifyAdapter({
    // По умолчанию Fastify отвечает 414 на параметр пути длиннее 100 символов,
    // а подписанный токен страницы рендера длиннее.
    maxParamLength: 512,

    /**
     * Косая черта в конце адреса ничего не меняет.
     *
     * Иначе клиент, вставивший на свою страницу
     * `…/tilda-js/ТОКЕН/` вместо `…/tilda-js/ТОКЕН`, получает «страница
     * не найдена» — и никакой подсказки, чем одно написание отличается
     * от другого. Кабинет выдаёт адрес без черты, но люди дописывают её
     * по привычке, а иногда её добавляет и сам редактор страницы.
     */
    ignoreTrailingSlash: true,

    /**
     * Настоящий адрес посетителя вместо адреса Caddy.
     *
     * Без этой строки Fastify берёт адрес из сокета, а до нас соединение
     * всегда доходит от обратного прокси — то есть все посетители выглядят
     * одним и тем же адресом из сети Docker. Ломается ровно то, ради чего
     * адрес и нужен: ограничение частоты входа считалось общим на всех,
     * защита публичных форм от перебора не работала, а в журналах заявок
     * вместо адреса заявителя записывался наш же контейнер.
     *
     * Доверяем не всем подряд, а только частным диапазонам: заголовок
     * X-Forwarded-For подделывается тривиально, и принимать его от кого
     * угодно значит отдать подмену адреса в руки того, от кого мы и
     * защищаемся. В боевой сборке наружу опубликован только Caddy
     * (docker-compose.prod.yml), API доступен лишь изнутри сети — поэтому
     * частные диапазоны здесь и есть «свои».
     */
    trustProxy: env.TRUST_PROXY,
  });

  /**
   * Большое тело запроса разрешено ровно одному маршруту.
   *
   * Подтверждение импорта уезжает на сервер целиком, одним JSON: десять
   * тысяч строк на шести колонках — это 1,4 МБ, а мегабайта по умолчанию
   * Fastify не пропускает и отвечает 413. Поднимать предел всем маршрутам
   * нельзя: под тем же сервером живут публичные адреса Тильды, виджетов
   * и верификации, и там предел в мегабайт — не помеха, а защита от того,
   * чтобы кто угодно занимал память сервиса шестнадцатью мегабайтами
   * на запрос. Поэтому предел ставится точечно, хуком на регистрации
   * маршрута: Fastify читает bodyLimit из настроек самого маршрута.
   */
  adapter.getInstance().addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (methods.includes('POST') && route.url === IMPORT_ROUTE) {
      route.bodyLimit = MAX_IMPORT_BODY_BYTES;
    }
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    // В проде подробности ошибок не должны утекать клиенту.
    logger: isProd ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
  });

  await app.register(helmet, {
    /**
     * API отдаёт только JSON и файлы, поэтому политика здесь максимально узкая:
     * если ответ каким-то образом будет интерпретирован как документ, выполнять
     * в нём нечего. Политика для самого приложения задаётся в Caddyfile —
     * она действует на HTML-страницу, которую отдаёт Caddy, а не API.
     */
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    // Ответы API не должны попадать в чужие документы как ресурсы.
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  });

  await app.register(fastifyCookie);
  await app.register(fastifySecureSession, {
    // secure-session требует ровно 32 байта; берём хеш от секрета произвольной длины.
    key: createHash('sha256').update(env.SESSION_SECRET).digest(),
    cookieName: 'gramota_session',
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: SESSION_TTL_SECONDS,
    },
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 10 },
  });

  registerPublicCors(app.getHttpAdapter().getInstance());

  app.setGlobalPrefix('api', { exclude: ['health'] });
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
