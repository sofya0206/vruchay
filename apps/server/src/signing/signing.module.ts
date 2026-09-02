import { Module } from '@nestjs/common';
import { PdfSignerService } from './pdf-signer.service';

/** Электронная подпись выпускаемых PDF. Один сертификат на сервис, из окружения. */
@Module({ providers: [PdfSignerService], exports: [PdfSignerService] })
export class SigningModule {}
