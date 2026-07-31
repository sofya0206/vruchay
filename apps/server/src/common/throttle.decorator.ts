import { SetMetadata } from '@nestjs/common';

export interface ThrottleOptions {
  max: number;
  timeWindow: string;
}

/**
 * Ограничение частоты для конкретного маршрута. Метаданные читает
 * ThrottleInterceptor — @fastify/rate-limit зарегистрирован с global: false,
 * поэтому по умолчанию лимитов нет и их нужно объявлять явно там, где они нужны:
 * вход, публичные эндпоинты Тильды и виджетов, страница проверки подлинности.
 */
export const THROTTLE_KEY = 'throttle:options';
export const Throttle = (options: ThrottleOptions) => SetMetadata(THROTTLE_KEY, options);
