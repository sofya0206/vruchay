import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { RegistryService } from './registry.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, RegistryService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
