import { Module } from '@nestjs/common';
import { OrgModule } from '../org/org.module';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';

/**
 * Остаток квоты берём из OrgService — той же службы, что рисует его
 * на главной кабинета. Своего расчёта не заводим: третья цифра, считающая
 * одно и то же по-своему, однажды разойдётся с двумя первыми.
 */
@Module({
  imports: [OrgModule],
  controllers: [ValidationController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
