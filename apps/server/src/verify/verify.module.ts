import { Module } from '@nestjs/common';
import { VerifyController } from './verify.controller';

/**
 * Проверка подлинности документа — единственная часть кабинета, открытая
 * без входа. Вынесена в отдельный модуль намеренно: так видно, что
 * публичного здесь ровно один маршрут, и он не тянет за собой ничего ещё.
 */
@Module({ controllers: [VerifyController] })
export class VerifyModule {}
