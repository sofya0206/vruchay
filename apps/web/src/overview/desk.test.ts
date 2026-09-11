import { describe, expect, it } from 'vitest';
import { jobPercent, lastJob, runningJobs, undelivered } from './desk';
import type { OverviewJob } from '../api/overview';
import type { LogItem } from '../mailing/api';

function job(over: Partial<OverviewJob>): OverviewJob {
  return {
    id: 'j1',
    documentId: 'd1',
    documentTitle: 'Мероприятие от 12.09.2026',
    status: 'done',
    total: 40,
    done: 40,
    failed: 0,
    createdAt: '2026-09-12T09:00:00Z',
    ...over,
  };
}

function letter(over: Partial<LogItem>): LogItem {
  return {
    id: 'e1',
    documentId: 'd1',
    documentTitle: 'Мероприятие от 12.09.2026',
    toEmail: 'anna@example.ru',
    subject: 'Ваш документ',
    status: 'sent',
    kind: 'transactional',
    queuedAt: '2026-09-12T09:00:00Z',
    sentAt: null,
    problem: null,
    ...over,
  };
}

describe('последнее задание по материалу', () => {
  it('берёт то, что позже, а не то, что первым в списке', () => {
    const older = job({ id: 'старое', createdAt: '2026-09-12T08:00:00Z' });
    const newer = job({ id: 'новое', createdAt: '2026-09-12T10:00:00Z' });
    expect(lastJob('d1', [older, newer])?.id).toBe('новое');
  });

  it('о чужом материале молчит, а не выдаёт соседнее задание', () => {
    expect(lastJob('d2', [job({ documentId: 'd1' })])).toBeNull();
  });

  it('материал без заданий остаётся без состояния', () => {
    // Сервер присылает только пять последних заданий по организации:
    // выпущенный месяц назад материал сюда не попадает, и подписывать
    // его «черновиком» нельзя.
    expect(lastJob('d1', [])).toBeNull();
  });
});

describe('что идёт прямо сейчас', () => {
  it('это очередь и выпуск, но не законченное и не отменённое', () => {
    const jobs = [
      job({ id: 'ждёт', status: 'queued' }),
      job({ id: 'идёт', status: 'running' }),
      job({ id: 'готово', status: 'done' }),
      job({ id: 'сорвалось', status: 'failed' }),
      job({ id: 'отменено', status: 'canceled' }),
    ];
    expect(runningJobs(jobs).map((j) => j.id)).toEqual(['ждёт', 'идёт']);
  });
});

describe('насколько задание прошло', () => {
  it('считает долю выпущенного', () => {
    expect(jobPercent({ done: 10, total: 40 })).toBe(25);
  });

  it('на пустом задании показывает начало, а не готовность', () => {
    expect(jobPercent({ done: 0, total: 0 })).toBe(0);
  });

  it('не переваливает за сто, если выпущено больше заявленного', () => {
    expect(jobPercent({ done: 45, total: 40 })).toBe(100);
  });
});

describe('недоставленные письма', () => {
  it('считает недоставленным и отказ ящика, и отказ шлюза', () => {
    const items = [
      letter({ id: 'ушло', status: 'sent' }),
      letter({ id: 'отказ ящика', status: 'bounced' }),
      letter({ id: 'прочитано', status: 'opened' }),
      letter({ id: 'отказ шлюза', status: 'failed' }),
    ];
    expect(undelivered(items, 10).map((i) => i.id)).toEqual(['отказ ящика', 'отказ шлюза']);
  });

  it('на главную берёт только первые — остальное в разделе писем', () => {
    const items = [
      letter({ id: '1', status: 'failed' }),
      letter({ id: '2', status: 'failed' }),
      letter({ id: '3', status: 'failed' }),
    ];
    expect(undelivered(items, 2)).toHaveLength(2);
  });
});
