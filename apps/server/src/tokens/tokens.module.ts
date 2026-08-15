import { Global, Module } from '@nestjs/common';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';

/**
 * Глобальный: службу проверки токенов зовёт AuthGuard, а он стоит
 * почти на каждом контроллере приложения.
 */
@Global()
@Module({
  controllers: [TokensController],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}
