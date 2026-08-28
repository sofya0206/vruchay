import { Module } from '@nestjs/common';
import { OrgModule } from '../org/org.module';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';

@Module({
  // Остаток пробы на рабочем столе и запрет на выпуск сверх предела —
  // одна и та же цифра, поэтому берём её у OrgService, а не считаем заново.
  imports: [OrgModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
