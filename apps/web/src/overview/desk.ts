import type { Overview, OverviewJob } from '../api/overview';
import type { Usage } from '../api/org';
import type { LogItem } from '../mailing/api';

/*
 * Выборки для блоков рабочего стола.
 *
 * Вынесено из разметки, потому что ошибиться здесь можно незаметно:
 * взять не то задание из пяти присланных, посчитать идущим уже законченный
 * выпуск или потерять отказ шлюза, показав только отказ ящика. В разметке
 * такая ошибка выглядит как обычная строка и живёт до первого звонка.
 */

/**
 * Последнее задание по материалу — или ничего.
 *
 * Сервер присылает пять последних заданий по всей организации, а не по
 * каждому материалу. Поэтому у материала, который выпускали месяц назад,
 * задания здесь не будет, и состояние ему приписывать нельзя: «черновик»
 * на выпущенной вчера грамоте — хуже, чем молчание.
 *
 * Порядок не берём на веру, хотя сервер и сортирует: два задания по одному
 * материалу за день — обычное дело (перевыпуск), и показать нужно то,
 * что позже.
 */
export function lastJob(documentId: string, jobs: OverviewJob[]): OverviewJob | null {
  return (
    jobs
      .filter((job) => job.documentId === documentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

/** Задания, которые идут прямо сейчас: ждут очереди или уже выпускаются. */
export function runningJobs(jobs: OverviewJob[]): OverviewJob[] {
  return jobs.filter((job) => job.status === 'queued' || job.status === 'running');
}

/**
 * Сколько задание прошло, в процентах.
 *
 * Задание без строк (`total` = 0) считаем начатым, а не завершённым:
 * полная полоса на задании, которое ещё ничего не выпустило, врёт.
 */
export function jobPercent(job: Pick<OverviewJob, 'done' | 'total'>): number {
  if (job.total <= 0) return 0;
  return Math.min(100, Math.round((job.done / job.total) * 100));
}

/**
 * Письма, которые не дошли.
 *
 * Отказ шлюза (`failed`) и отказ ящика (`bounced`) в одной выборке —
 * так же, как в папке «Не доставлено» раздела писем: для человека это
 * одно и то же «не дошло», и разводить их по двум спискам на главной
 * значит заставить его выбирать между словами, которых он не различает.
 */
export function undelivered(items: LogItem[], limit: number): LogItem[] {
  return items.filter((item) => item.status === 'bounced' || item.status === 'failed').slice(0, limit);
}

export type StepState = 'done' | 'current' | 'next';

/**
 * Где организация на пути «документ → список → письма».
 *
 * Шаг считается пройденным по следу в данных, а не по нажатиям: есть
 * материал — документ создан; есть выпущенное — список загружали и
 * выпускали; ушло хоть одно письмо — рассылку освоили. Текущий — первый
 * не пройденный, всё после него — впереди. Когда пройдено всё, полоса
 * остаётся: она ещё и навигация по трём разделам в том порядке, в каком
 * идёт работа.
 */
export function flowSteps(
  data: Pick<Overview, 'materials' | 'issuedTotal' | 'emailsSent'>,
): [StepState, StepState, StepState] {
  const done = [data.materials > 0, data.issuedTotal > 0, data.emailsSent > 0];
  const current = done.indexOf(false);
  return done.map((d, i) => (d ? 'done' : i === current ? 'current' : 'next')) as [
    StepState,
    StepState,
    StepState,
  ];
}

/**
 * Цвет полосы остатка — по порогу, который считает сервер.
 *
 * Свой порог здесь не заводим: сервер тем же `warn` решает, пускать ли
 * к выпуску, и полоса обязана краснеть ровно тогда, когда он откажет.
 */
export function usageTone(usage: Pick<Usage, 'warn' | 'expired'>): 'ok' | 'warn' | 'bad' {
  if (usage.expired || usage.warn === 'critical' || usage.warn === 'exhausted') return 'bad';
  if (usage.warn === 'low') return 'warn';
  return 'ok';
}

/** Сколько плана израсходовано, 0–100. Без ограничения — 0. */
export function usagePercent(usage: Pick<Usage, 'used' | 'limit'>): number {
  if (usage.limit === null || usage.limit <= 0) return 0;
  return Math.min(100, Math.round((usage.used / usage.limit) * 100));
}
