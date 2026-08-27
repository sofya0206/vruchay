import { Module } from '@nestjs/common';
import { AwardRulesController, DocumentAwardsController } from './awards.controller';
import { AwardsService } from './awards.service';

@Module({
  controllers: [AwardRulesController, DocumentAwardsController],
  providers: [AwardsService],
  exports: [AwardsService],
})
export class AwardsModule {}
