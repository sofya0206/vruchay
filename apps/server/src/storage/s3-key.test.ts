import { describe, expect, it } from 'vitest';
import { buildS3Key, contentDisposition } from './s3-key';

const org = '11111111-1111-1111-1111-111111111111';
const doc = '22222222-2222-2222-2222-222222222222';
const file = '33333333-3333-3333-3333-333333333333';
const job = '44444444-4444-4444-4444-444444444444';

describe('buildS3Key', () => {
  it('строит ключ фона', () => {
    expect(buildS3Key({ orgId: org, documentId: doc, kind: 'background', fileId: file, ext: 'png' })).toBe(
      `org/${org}/doc/${doc}/bg/${file}.png`,
    );
  });

  it('строит ключ сгенерированного файла с папкой задания', () => {
    expect(
      buildS3Key({ orgId: org, documentId: doc, jobId: job, kind: 'generated', fileId: file, ext: '.PDF' }),
    ).toBe(`org/${org}/doc/${doc}/gen/${job}/${file}.pdf`);
  });

  it('файлы организации без материала — логотип — лежат вне документа', () => {
    expect(buildS3Key({ orgId: org, kind: 'asset', fileId: file, ext: 'png' })).toBe(
      `org/${org}/asset/${file}.png`,
    );
    expect(buildS3Key({ orgId: org, documentId: doc, kind: 'asset', fileId: file, ext: 'png' })).toBe(
      `org/${org}/doc/${doc}/asset/${file}.png`,
    );
  });

  it('шрифты лежат вне документа', () => {
    expect(buildS3Key({ orgId: org, kind: 'font', fileId: file, ext: 'woff2' })).toBe(
      `org/${org}/fonts/${file}.woff2`,
    );
  });

  it('требует jobId для сгенерированных файлов', () => {
    expect(() =>
      buildS3Key({ orgId: org, documentId: doc, kind: 'generated', fileId: file, ext: 'pdf' }),
    ).toThrow(/jobId/);
  });
});

describe('contentDisposition', () => {
  it('кодирует кириллическое имя файла', () => {
    const header = contentDisposition('Сертификат Иванов.pdf');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toMatch(/filename="[\x20-\x7e]+"/);
  });
});
