import { Module } from '@nestjs/common';
import { RegistryModule } from '../registry/registry.module';
import { VerifyController } from './verify.controller';

/**
 * Проверка подлинности документа — единственная часть кабинета, открытая
 * без входа. Вынесена в отдельный модуль намеренно: так видно, что
 * публичного здесь ровно один маршрут, и он не тянет за собой ничего ещё.
 *
 * Реестр нужен ему ради одного — связи «старый документ заменён новым».
 * Считать её здесь заново значило бы завести второе мнение о том,
 * какой документ действителен.
 */
@Module({ imports: [RegistryModule], controllers: [VerifyController] })
export class VerifyModule {}
