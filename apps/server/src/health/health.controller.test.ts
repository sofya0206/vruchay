import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';
import { testConfig } from '../config/env.test-utils';

describe('HealthController', () => {
  it('возвращает status ok', () => {
    const res = new HealthController(testConfig() as never).health();
    expect(res.status).toBe('ok');
    expect(new Date(res.time).getTime()).not.toBeNaN();
  });
});
