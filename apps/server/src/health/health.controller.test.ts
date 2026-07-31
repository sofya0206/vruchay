import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('возвращает status ok', () => {
    const res = new HealthController().health();
    expect(res.status).toBe('ok');
    expect(new Date(res.time).getTime()).not.toBeNaN();
  });
});
