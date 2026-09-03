import { Module } from '@nestjs/common';
import { RoadmapController, SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController, RoadmapController],
  providers: [SupportService],
})
export class SupportModule {}
