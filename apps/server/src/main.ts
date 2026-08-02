import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySecureSession from '@fastify/secure-session';
import fastifyMultipart from '@fastify/multipart';
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
