import { Module } from '@nestjs/common';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';

@Module({
  controllers: [OrgController],
  providers: [OrgService],
  // Остаток пробы показывает не только главная кабинета, но и проверка
  // списка перед выпуском — обе берут его отсюда, чтобы цифра была одна.
  exports: [OrgService],
})
export class OrgModule {}
