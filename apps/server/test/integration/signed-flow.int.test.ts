import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase, waitFor } from './support/db';
import { makeDocument, makeOrg, makeRows } from './support/fixtures';
import { startApp, type IntegrationApp } from './support/app';

/**
 * Выпуск с электронной подписью — целиком: очередь, Chromium, подпись,
 * хранилище, отпечаток, страница проверки.
 *
 * Сертификат самоподписанный и живёт один прогон. В конвейере OpenSSL
 * есть; без него тест пропускается, а не падает.
 */
function hasOpenssl(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasOpenssl())('выпуск подписанных PDF', () => {
  let app: IntegrationApp;
  let dir = '';
  let orgId = '';
  let documentId = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vruchay-signed-'));
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
        '/CN=Vruchay Test',
        '-keyout',
        join(dir, 'k.pem'),
        '-out',
        join(dir, 'c.pem'),
      ],
      { stdio: 'ignore' },
    );
    execFileSync(
      'openssl',
      [
        'pkcs12',
        '-export',
        '-inkey',
        join(dir, 'k.pem'),
        '-in',
        join(dir, 'c.pem'),
        '-out',
        join(dir, 's.p12'),
        '-passout',
        'pass:int-test',
        '-keypbe',
        'PBE-SHA1-3DES',
        '-certpbe',
        'PBE-SHA1-3DES',
        '-macalg',
        'sha1',
      ],
      { stdio: 'ignore' },
    );

    app = await startApp({
      worker: true,
      env: {
        PDF_SIGN_P12_BASE64: readFileSync(join(dir, 's.p12')).toString('base64'),
        PDF_SIGN_P12_PASSWORD: 'int-test',
      },
    });
    await resetDatabase(app.prisma);

    // Подпись — платная возможность: организация на оплаченном тарифе.
    const org = await makeOrg(app.prisma, { name: 'Федерация', plan: 'paid' });
    orgId = org.id;
    const document = await makeDocument(app.prisma, orgId, { title: 'Диплом' });
    documentId = document.id;
    await makeRows(app.prisma, documentId, [{ name: 'Иванов Пётр Ильич', email: 'i@example.ru' }]);
  });

  afterAll(async () => {
    await app?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('выпущенный PDF подписан, отпечаток снят с подписанных байтов, страница проверки это знает', async () => {
    const { job, rowIds } = await app.generation.start(orgId, documentId, 'pdf');
    await app.processor.enqueue(job, rowIds);

    const file = await waitFor('файл появится', () =>
      app.prisma.file.findFirst({
        where: { jobId: job.id, kind: 'generated', s3Key: { not: '' } },
      }),
    );

    expect(file.signedAt).not.toBeNull();
    const bytes = app.storage.read(file.s3Key)!;
    const text = bytes.toString('latin1');
    expect(text).toContain('/ByteRange [');
    expect(text).toContain('/SubFilter /adbe.pkcs7.detached');

    // Отпечаток — с того, что ушло в хранилище, то есть с подписанного.
    const { createHash } = await import('node:crypto');
    expect(file.pdfSha256).toBe(createHash('sha256').update(bytes).digest('hex'));

    const answer = await app.verify.check(file.publicCode as string);
    expect(answer.signed).toBe(true);
    expect(answer.sha256).toBe(file.pdfSha256);
  });

  it('на бесплатной пробе подписи нет', async () => {
    await app.prisma.organization.update({ where: { id: orgId }, data: { plan: 'free' } });
    const document = await makeDocument(app.prisma, orgId, { title: 'Грамота' });
    await makeRows(app.prisma, document.id, [{ name: 'Смирнова Анна', email: 's@example.ru' }]);

    const { job, rowIds } = await app.generation.start(orgId, document.id, 'pdf');
    await app.processor.enqueue(job, rowIds);
    const file = await waitFor('файл появится', () =>
      app.prisma.file.findFirst({
        where: { jobId: job.id, kind: 'generated', s3Key: { not: '' } },
      }),
    );
    expect(file.signedAt).toBeNull();
    expect(app.storage.read(file.s3Key)!.toString('latin1')).not.toContain('/ByteRange [');
  });
});
