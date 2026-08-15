import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Глобальный: записывать в журнал должны самые разные места — выпуск,
 * рассылка, удаление, состав сотрудников. Тянуть импорт модуля в каждое
 * из них значит плодить связи ради одной строчки.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
