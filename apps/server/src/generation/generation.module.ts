import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationProcessor } from './generation.processor';
import { PdfRenderer } from './pdf-renderer';

@Module({
  controllers: [GenerationController],
  providers: [GenerationService, GenerationProcessor, PdfRenderer],
  // GenerationProcessor отдаём наружу, чтобы перевыпуск из реестра ставил
  // задания в ту же очередь, а не заводил вторую. Экземпляр один на процесс:
  // он же держит воркера, и второй создал бы второго воркера.
  exports: [GenerationService, GenerationProcessor, PdfRenderer],
})
export class GenerationModule {}
