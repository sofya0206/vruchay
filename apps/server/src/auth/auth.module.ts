import { Global, Module, forwardRef } from '@nestjs/common';
import { AuthController, SessionsController, TotpController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegistrationService } from './registration.service';
import { PasswordResetService } from './password-reset.service';
import { AuthGuard } from './auth.guard';
import { SessionService } from './session.service';
import { TotpService } from './totp.service';
import { AccountDeletionService } from './account-deletion.service';
import { MailModule } from '../mail/mail.module';

@Global()
@Module({
  // Письмо о подтверждении адреса шлёт почтовый модуль, а тот, в свою очередь,
  // защищён обычной аутентификацией — отсюда взаимная зависимость модулей
  // и forwardRef. Разрывать её выделением третьего модуля ради одного письма
  // не стоит: связь тут по существу, а не по недосмотру.
  imports: [forwardRef(() => MailModule)],
  controllers: [AuthController, TotpController, SessionsController],
  providers: [AuthService, RegistrationService, PasswordResetService, AuthGuard, SessionService, TotpService, AccountDeletionService],
  // SessionService наружу: сессию открывают и приглашение сотрудника,
  // и смена пароля закрывает остальные.
  exports: [AuthService, AuthGuard, SessionService],
})
export class AuthModule {}
