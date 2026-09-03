import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../config/env.test-utils';
import { PdfSignerService } from './pdf-signer.service';

/**
 * Подпись PDF проверяется настоящим OpenSSL, а не «в файле есть /Contents».
 *
 * Сертификат — самоподписанный и живёт ровно один прогон: генерируется
 * во временной папке и стирается. В репозитории ни ключа, ни сертификата
 * нет и быть не должно. Алгоритмы PKCS#12 — старые (3DES, SHA-1) намеренно:
 * node-forge, на котором держится подписывающий, не читает контейнеры
 * с AES-256, которые OpenSSL 3 делает по умолчанию.
 */
function hasOpenssl(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasOpenssl())('электронная подпись PDF', () => {
  let dir = '';
  let p12Base64 = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'vruchay-sign-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=Vruchay Test Signer/O=Vruchay',
        '-keyout',
        join(dir, 'key.pem'),
        '-out',
        join(dir, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
    execFileSync(
      'openssl',
      [
        'pkcs12',
        '-export',
        '-inkey',
        join(dir, 'key.pem'),
        '-in',
        join(dir, 'cert.pem'),
        '-out',
        join(dir, 'signer.p12'),
        '-passout',
        'pass:test-pass',
        '-keypbe',
        'PBE-SHA1-3DES',
        '-certpbe',
        'PBE-SHA1-3DES',
        '-macalg',
        'sha1',
      ],
      { stdio: 'ignore' },
    );
    p12Base64 = readFileSync(join(dir, 'signer.p12')).toString('base64');
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function samplePdf(): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([420, 297]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Vruchay certificate', { x: 40, y: 200, size: 24, font });
    return Buffer.from(await doc.save());
  }

  function serviceWith(over: Record<string, string> = {}) {
    return new PdfSignerService(
      testConfig({
        PDF_SIGN_P12_BASE64: p12Base64,
        PDF_SIGN_P12_PASSWORD: 'test-pass',
        ...over,
      }) as never,
    );
  }

  const meta = {
    issuer: 'Федерация',
    code: 'K7M2-9QXR-4TVB',
    verifyUrl: 'https://vruchay.ru/c/K7M2-9QXR-4TVB',
  };

  /**
   * Подпись и подписанное — по /ByteRange: [a b c d] означает, что
   * подписаны байты a..a+b и c..c+d, а между ними лежит сама подпись
   * в угловых скобках, дополненная нулями до длины заготовки.
   */
  function signatureParts(bytes: Buffer): { content: Buffer; der: Buffer } {
    const text = bytes.toString('latin1');
    const range = /\/ByteRange \[(\d+) (\d+) (\d+) (\d+)\]/.exec(text);
    expect(range).not.toBeNull();
    const [, a, b, c, d] = range!.map(Number);
    expect(text[a + b]).toBe('<');
    expect(text[c - 1]).toBe('>');
    const hex = text.slice(a + b + 1, c - 1).replace(/(00)+$/, '');
    return {
      content: Buffer.concat([bytes.subarray(a, a + b), bytes.subarray(c, c + d)]),
      der: Buffer.from(hex, 'hex'),
    };
  }

  it('без сертификата в окружении отдаёт файл как есть', async () => {
    const service = new PdfSignerService(testConfig() as never);
    const pdf = await samplePdf();
    expect(service.enabled).toBe(false);
    expect(await service.signIfConfigured(pdf, meta)).toEqual({ bytes: pdf, signed: false });
  });

  it('вкладывает подпись PKCS#7, которую подтверждает OpenSSL', async () => {
    const service = serviceWith();
    const pdf = await samplePdf();
    const { bytes, signed } = await service.signIfConfigured(pdf, meta);
    expect(signed).toBe(true);
    expect(bytes.length).toBeGreaterThan(pdf.length);

    const { content, der } = signatureParts(bytes);
    writeFileSync(join(dir, 'content.bin'), content);
    writeFileSync(join(dir, 'sig.der'), der);

    // -noverify: цепочку доверия не проверяем (сертификат самоподписанный),
    // проверяем саму подпись над содержимым — что она есть и сходится.
    const out = execFileSync(
      'openssl',
      [
        'cms',
        '-verify',
        '-inform',
        'DER',
        '-in',
        join(dir, 'sig.der'),
        '-content',
        join(dir, 'content.bin'),
        '-noverify',
        '-binary',
        '-out',
        '/dev/null',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(out).toBeDefined();
    expect(bytes.toString('latin1')).toContain('/SubFilter /adbe.pkcs7.detached');
  });

  it('изменённый после подписи файл больше не сходится', async () => {
    const service = serviceWith();
    const { bytes } = await service.signIfConfigured(await samplePdf(), meta);
    const { content, der } = signatureParts(bytes);

    // Сначала убеждаемся, что нетронутое сходится, — иначе «не сходится»
    // ниже ничего не доказывало бы.
    writeFileSync(join(dir, 'ok.bin'), content);
    writeFileSync(join(dir, 'sig2.der'), der);
    execFileSync(
      'openssl',
      [
        'cms',
        '-verify',
        '-inform',
        'DER',
        '-in',
        join(dir, 'sig2.der'),
        '-content',
        join(dir, 'ok.bin'),
        '-noverify',
        '-binary',
        '-out',
        '/dev/null',
      ],
      { stdio: 'ignore' },
    );

    // Портим один байт содержимого.
    const tampered = Buffer.from(content);
    tampered[100] ^= 0xff;
    writeFileSync(join(dir, 'tampered.bin'), tampered);

    expect(() =>
      execFileSync(
        'openssl',
        [
          'cms',
          '-verify',
          '-inform',
          'DER',
          '-in',
          join(dir, 'sig2.der'),
          '-content',
          join(dir, 'tampered.bin'),
          '-noverify',
          '-binary',
          '-out',
          '/dev/null',
        ],
        { stdio: 'ignore' },
      ),
    ).toThrow();
  });

  it('неверный пароль к контейнеру не роняет выпуск — файл уходит без подписи', async () => {
    const service = serviceWith({ PDF_SIGN_P12_PASSWORD: 'wrong' });
    const pdf = await samplePdf();
    const result = await service.signIfConfigured(pdf, meta);
    expect(result.signed).toBe(false);
    expect(result.bytes).toBe(pdf);
  });
});
