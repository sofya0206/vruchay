import { describe, expect, it } from 'vitest';
import { createRenderToken, verifyRenderToken, RENDER_TOKEN_TTL_SECONDS } from './render-token';

const SECRET = 'x'.repeat(48);
const NOW = 1_800_000_000;
const payload = { jobId: 'job-1', rowId: 'row-1' };

describe('токен страницы рендера', () => {
  it('проверяется тем же секретом', () => {
    const token = createRenderToken(payload, SECRET, NOW);
    expect(verifyRenderToken(token, SECRET, NOW)).toMatchObject(payload);
  });

  it('отклоняется чужим секретом', () => {
    const token = createRenderToken(payload, SECRET, NOW);
    expect(verifyRenderToken(token, 'y'.repeat(48), NOW)).toBeNull();
  });

  it('отклоняется при подмене данных', () => {
    const token = createRenderToken(payload, SECRET, NOW);
    const [data, sig] = token.split('.');
    const tampered = Buffer.from(
      JSON.stringify({ jobId: 'job-1', rowId: 'чужая-строка', exp: NOW + 600 }),
      'utf8',
    ).toString('base64url');
    expect(verifyRenderToken(`${tampered}.${sig}`, SECRET, NOW)).toBeNull();
    expect(data).not.toBe(tampered);
  });

  it('протухает по истечении срока', () => {
    const token = createRenderToken(payload, SECRET, NOW);
    expect(verifyRenderToken(token, SECRET, NOW + RENDER_TOKEN_TTL_SECONDS - 1)).not.toBeNull();
    expect(verifyRenderToken(token, SECRET, NOW + RENDER_TOKEN_TTL_SECONDS + 1)).toBeNull();
  });

  it('не падает на мусоре вместо токена', () => {
    for (const bad of ['', '.', 'abc', 'a.b.c', 'нетоken', '..']) {
      expect(verifyRenderToken(bad, SECRET, NOW)).toBeNull();
    }
  });
});
