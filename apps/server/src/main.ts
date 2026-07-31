import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySecureSession from '@fastify/secure-session';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { validateEnv } from './config/env';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

async function bootstrap() {
  const env = validateEnv(process.env);
  const isProd = env.NODE_ENV === 'production';

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    // В проде подробности ошибок не должны утекать клиенту.
    logger: isProd ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
  });

  await app.register(helmet, {
    // CSP настраивается отдельно вместе с фронтендом; сейчас важнее остальные заголовки.
    contentSecurityPolicy: false,
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

  app.setGlobalPrefix('api', { exclude: ['health'] });
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
