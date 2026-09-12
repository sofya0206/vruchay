import type { Overview, OverviewJob } from '../api/overview';
import type { LogItem } from '../mailing/api';

export interface FirstStep {
  id: 'material' | 'issue' | 'mail';
  label: string;
  hint: string;
  to: string;
  done: boolean;
}

/**
 * Первые шаги организации — три галочки на главной.
 *
 * Считаются по тому, что уже сделано, а не по тому, что нажали: шаг
 * «выпустить» отмечен, когда в реестре появился первый документ, даже
 * если выпустили его через API, минуя кабинет. Порядок — тот, в котором
 * работа идёт в жизни: собрать лист, выпустить, разослать.
 */
export function firstSteps(data: Pick<Overview, 'materials' | 'issuedTotal' | 'emailsSent'>): FirstStep[] {
  return [
    {
      id: 'material',
      label: 'Соберите документ',
      hint: 'Загрузите бланк и поставьте поля: фамилию, место, дату',
      to: '/documents?new=1',
      done: data.materials > 0,
    },
    {
      id: 'issue',
      label: 'Выпустите документы',
      hint: 'Подставьте имена из списка — файлы соберутся сами',
      to: '/documents',
      done: data.issuedTotal > 0,
    },
    {
      id: 'mail',
      label: 'Разошлите письма',
      hint: 'Каждый получит свой документ на почту',
      to: '/mailing?list=new',
      done: data.emailsSent > 0,
    },
  ];
}

/** Все шаги пройдены — блоку на главной больше нечего сказать. */
export function allStepsDone(steps: FirstStep[]): boolean {
  return steps.every((step) => step.done);
}

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
