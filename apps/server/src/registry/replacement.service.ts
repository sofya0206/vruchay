import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Файл, у которого перевыпуск обещан, но ещё не подтверждён. */
export interface PendingReplacement {
  id: string;
  orgId: string;
  rowId: string | null;
  replacedByJobId: string | null;
  replacedById: string | null;
}

/** Чем закончилось ожидание: нашли замену, отменили обещание или ждём дальше. */
export type Settled = { replacedById: string | null };

/**
 * Связь «старый документ → новый».
 *
 * Перевыпуск устроен в два шага, и не от лишней сложности. Нажимая
 * «Перевыпустить», человек ставит задание в очередь: нового документа
 * в этот момент ещё нет, он появится через минуту или через час, а может
 * не появиться вовсе — воркер упадёт, выпуск отменят, строку удалят.
 *
 * Поэтому в момент нажатия мы записываем только обещание — `replacedByJobId`.
 * Пока обещание не исполнено, старый документ остаётся действительным:
 * погасить настоящий сертификат под обещание нового значит оставить
 * человека вообще без документа. Когда новый файл появляется, обещание
 * превращается в ссылку `replacedById`, и старый становится «заменён».
 *
 * Ищем замену по паре (job_id, row_id) — тому же ключу идемпотентности,
 * которым пользуется очередь выпуска. Найденную запоминаем: строку
 * получателя могут удалить, и тогда искать замену станет нечем, а ответ
 * страницы проверки «Заменён на …» обязан пережить уборку таблицы.
 */
@Injectable()
export class ReplacementService {
  private readonly logger = new Logger(ReplacementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Подтвердить или снять обещания по списку файлов.
   *
   * Вызывается на прочитанной странице реестра, а не по всей организации:
   * иначе каждое открытие таблицы перебирало бы десятки тысяч файлов
   * ради двух-трёх ожидающих.
   *
   * Возвращает карту «файл → его замена» только для тех, у кого что-то
   * изменилось; остальным менять нечего.
   */
  async settle(files: PendingReplacement[]): Promise<Map<string, Settled>> {
    const pending = files.filter((f) => f.replacedByJobId && !f.replacedById);
    const changed = new Map<string, Settled>();
    if (pending.length === 0) return changed;

    const jobIds = [...new Set(pending.map((f) => f.replacedByJobId as string))];
    // Организацию берём из самих файлов и ставим в условие: задание
    // записано нами и чужим быть не может, но выборка не должна
    // полагаться на это — ошибка в одном месте не обязана становиться
    // утечкой в другом.
    const orgIds = [...new Set(pending.map((f) => f.orgId))];

    const [fresh, jobs] = await Promise.all([
      this.prisma.file.findMany({
        where: {
          orgId: { in: orgIds },
          jobId: { in: jobIds },
          kind: 'generated',
          deletedAt: null,
          s3Key: { not: '' },
        },
        select: { id: true, jobId: true, rowId: true },
      }),
      this.prisma.generationJob.findMany({
        where: { id: { in: jobIds }, orgId: { in: orgIds } },
        select: { id: true, status: true },
      }),
    ]);

    const byKey = new Map(fresh.map((f) => [`${f.jobId}:${f.rowId}`, f.id]));
    const status = new Map(jobs.map((j) => [j.id, j.status]));

    for (const file of pending) {
      const jobId = file.replacedByJobId as string;
      const replacement = file.rowId ? byKey.get(`${jobId}:${file.rowId}`) : undefined;

      if (replacement) {
        await this.write(file.id, { replacedById: replacement });
        changed.set(file.id, { replacedById: replacement });
        continue;
      }

      /*
       * Замены нет, а задание уже не работает — обещание снимаем.
       *
       * Иначе документ навсегда остался бы в подвешенном состоянии:
       * в реестре «перевыпускается», хотя перевыпускать давно перестали.
       * Пропавшее задание (его могли удалить вместе с материалом)
       * считаем закончившимся по той же причине.
       */
      const jobStatus = status.get(jobId);
      if (!jobStatus || jobStatus === 'done' || jobStatus === 'failed' || jobStatus === 'canceled') {
        await this.write(file.id, { replacedByJobId: null });
        changed.set(file.id, { replacedById: null });
      }
    }

    return changed;
  }

  /** То же самое для одного файла — страница проверки читает по одному. */
  async settleOne(file: PendingReplacement): Promise<string | null> {
    const changed = await this.settle([file]);
    const settled = changed.get(file.id);
    return settled ? settled.replacedById : file.replacedById;
  }

  /**
   * Запись состояния не роняет чтение.
   *
   * Реестр и страница проверки обязаны отвечать, даже если база в этот
   * момент отказала в записи: подтверждение замены — уточнение того же
   * самого факта, и оно повторится при следующем открытии.
   */
  private async write(
    id: string,
    data: { replacedById?: string; replacedByJobId?: null },
  ): Promise<void> {
    try {
      await this.prisma.file.update({ where: { id }, data });
    } catch (err) {
      this.logger.warn(
        `Не удалось подтвердить перевыпуск файла ${id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
