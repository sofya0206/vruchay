import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationProcessor } from './generation.processor';
import { PdfRenderer } from './pdf-renderer';

@Module({
  controllers: [GenerationController],
  providers: [GenerationService, GenerationProcessor, PdfRenderer],
  exports: [GenerationService, PdfRenderer],
})
export class GenerationModule {}
