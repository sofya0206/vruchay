import { Module } from '@nestjs/common';
import { PublicOrgController } from './public-org.controller';
import { PublicOrgService } from './public-org.service';

/**
 * Публичная страница организации — второй после проверки документа
 * открытый наружу модуль. Отдельно от кабинета и от внутреннего реестра
 * намеренно: см. PublicOrgController.
 */
@Module({ controllers: [PublicOrgController], providers: [PublicOrgService] })
export class PublicOrgModule {}
