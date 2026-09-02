import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import type { Env } from '../config/env';

/** Что писать в подпись — видно в свойствах подписи в Adobe Reader. */
export interface SigningMeta {
  /** Название организации-эмитента: «Выдан: Федерация плавания». */
  issuer: string;
  /** Публичный код документа — чтобы подпись ссылалась на страницу проверки. */
  code: string;
  verifyUrl: string;
}

export interface SigningResult {
  bytes: Buffer;
  signed: boolean;
}

/**
 * Электронная подпись PDF (PAdES, уровень B-B).
 *
 * Подписывает один сертификат сервиса — тот, что задан в окружении, —
 * а не сертификаты организаций: у клиентов их нет, а «зелёная галочка»
 * в Adobe Reader появляется от сертификата любого УЦ из списка AATL.
 * Сертификат и ключ приходят только из окружения (PKCS#12 в base64
 * и пароль к нему); в коде и в репозитории им места нет.
 *
 * Что это даёт и чего не даёт — честно:
 *
 * - подпись — PKCS#7 detached, SHA-256, вложенная в PDF по ISO 32000
 *   (`adbe.pkcs7.detached`): её проверяет Adobe Reader и большинство
 *   просмотрщиков, изменённый после подписи файл показывается сломанным;
 * - это уровень B-B: без метки времени доверенной службы (TSA) и без
 *   сведений для долгосрочной проверки (OCSP/CRL внутри файла). Через
 *   годы, когда сертификат истечёт, подпись станет непроверяемой.
 *   Уровень B-LT требует TSA и хранения цепочки — это отдельная работа
 *   на pyHanko/DSS, а не на node-signpdf, который умеет только B-B;
 * - это не КЭП по ГОСТ Р 34.10-2012: юридически значимая подпись по
 *   63-ФЗ — отдельный продукт с КриптоПро, здесь его нет намеренно.
 *
 * Без сертификата в окружении сервис работает как раньше: файлы
 * выпускаются без подписи, и это правильное состояние для разработки.
 */
@Injectable()
export class PdfSignerService {
  private readonly logger = new Logger(PdfSignerService.name);
  private readonly p12: Buffer | null;
  private readonly passphrase: string;
  private readonly signPdf = new SignPdf();
  private warned = false;

  constructor(private readonly config: ConfigService<Env, true>) {
    const base64 = this.config.get('PDF_SIGN_P12_BASE64', { infer: true });
    this.p12 = base64 ? Buffer.from(base64, 'base64') : null;
    this.passphrase = this.config.get('PDF_SIGN_P12_PASSWORD', { infer: true });
  }

  /** Настроен ли сертификат — по этому решается, обещать ли подпись. */
  get enabled(): boolean {
    return this.p12 !== null;
  }

  /**
   * Подписывает PDF, если сертификат настроен; иначе отдаёт как есть.
   *
   * Неудача подписи не роняет выпуск: документ без подписи лучше, чем
   * ни одного документа. Но она пишется в журнал, и первая же — громко.
   */
  async signIfConfigured(pdf: Buffer, meta: SigningMeta): Promise<SigningResult> {
    if (!this.p12) return { bytes: pdf, signed: false };
    try {
      return { bytes: await this.sign(pdf, meta), signed: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!this.warned) {
        this.warned = true;
        this.logger.error(`Подпись PDF не работает, документы выпускаются без неё: ${message}`);
      } else {
        this.logger.warn(`Подпись PDF не удалась: ${message}`);
      }
      return { bytes: pdf, signed: false };
    }
  }

  /** Сама подпись — без запасного пути: тесты и проверка сертификата зовут её напрямую. */
  async sign(pdf: Buffer, meta: SigningMeta, signingTime = new Date()): Promise<Buffer> {
    if (!this.p12) throw new Error('Сертификат подписи не настроен');

    const doc = await PDFDocument.load(pdf, { updateMetadata: false });
    pdflibAddPlaceholder({
      pdfDoc: doc,
      reason: `Выдан: ${meta.issuer}. Проверка: ${meta.verifyUrl}`,
      contactInfo: meta.verifyUrl,
      name: 'Вручай',
      location: 'vruchay.ru',
      signingTime,
      appName: 'Вручай',
    });
    // Без объектных потоков: подписывающий ищет /ByteRange и /Contents
    // в тексте файла, а внутри сжатого потока их не найти.
    const withPlaceholder = Buffer.from(await doc.save({ useObjectStreams: false }));

    const signer = new P12Signer(this.p12, { passphrase: this.passphrase });
    return this.signPdf.sign(withPlaceholder, signer, signingTime);
  }
}
