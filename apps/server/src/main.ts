import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySecureSession from '@fastify/secure-session';
import fastifyMultipart from '@fastify/multipart';
import fastifyFormbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import { MAX_IMAGE_BYTES } from './common/image-type';
import { AppModule } from './app.module';
import { validateEnv } from './config/env';
import { registerPublicCors } from './tilda/public-cors';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

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

  /*
   * Формы Тильда отправляет как `application/x-www-form-urlencoded`,
   * а Fastify сам разбирает только JSON. Предел взят с запасом на длинное
   * поле COOKIES, которое Тильда прикладывает к каждой отправке, но так,
   * чтобы этот открытый маршрут нельзя было забить телом на мегабайт.
   */
  await app.register(fastifyFormbody, { bodyLimit: 64 * 1024 });

  registerPublicCors(app.getHttpAdapter().getInstance());

  app.setGlobalPrefix('api', { exclude: ['health'] });
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
