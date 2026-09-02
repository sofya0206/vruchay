import { Readable } from 'node:stream';
import { GenerationProcessor } from './generation.processor';
import { GenerationService } from './generation.service';

/*
 * Стенд для проверок очереди генерации.
 *
 * Заменяет Prisma, хранилище и BullMQ ровно настолько, насколько нужно
 * правилам, которые мы проверяем: база считает файлы и держит уникальность
 * (job_id, row_id), очередь отдаёт задачи в том же порядке, что BullMQ, —
 * меньший приоритет раньше, при равном приоритете живая очередь.
 *
 * Живая база и живой Redis для этого не годятся: правила про деньги должны
 * проверяться на каждый прогон тестов, а не раз в релиз вручную.
 */

export interface FileRec {
  id: string;
  orgId: string;
  documentId: string | null;
  jobId: string | null;
  rowId: string | null;
  kind: string;
  s3Key: string;
  mime: string;
  sizeBytes: number;
  publicId: string;
  publicCode?: string | null;
  originalName: string;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface RowRec {
  id: string;
  documentId: string;
  position: number;
  data: Record<string, string>;
  checked: boolean;
  lastFileId: string | null;
}

export interface JobRec {
  id: string;
  orgId: string;
  documentId: string;
  format: string;
  status: string;
  total: number;
  done: number;
  failed: number;
  error: string | null;
  chunks: number;
  attempt: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface FailureRec {
  jobId: string;
  rowId: string;
  message: string;
  createdAt: Date;
}

/** Падение процесса: вылетает мимо построчного перехвата, как настоящее. */
export class Crash extends Error {}

/** Условие Prisma в объёме, который используют сервис и воркер. */
type Where = Record<string, unknown>;

function matchValue(actual: unknown, expected: unknown): boolean {
  if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
    const cond = expected as Record<string, unknown>;
    if ('in' in cond) return (cond.in as unknown[]).includes(actual);
    if ('not' in cond) return actual !== cond.not;
    // Сравнение по времени: им сторож ищет задания, висящие дольше срока.
    if ('lt' in cond) return Number(actual) < Number(cond.lt);
    if ('gt' in cond) return Number(actual) > Number(cond.gt);
    return true;
  }
  return actual === expected;
}

function matches(record: Record<string, unknown>, where: Where = {}): boolean {
  return Object.entries(where).every(([key, expected]) => matchValue(record[key], expected));
}

function applyData(record: Record<string, unknown>, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && 'increment' in (value as object)) {
      record[key] = (record[key] as number) + (value as { increment: number }).increment;
    } else {
      record[key] = value;
    }
  }
}

export interface WorldOptions {
  /** Сколько отмеченных строк завести в документе. */
  rows?: number;
  plan?: 'free' | 'paid';
  /** Номера отрисовок (сквозные), которые не удались. */
  renderFails?: number[];
  /**
   * Текст, с которым падает отрисовка.
   *
   * По умолчанию — незнакомая причина: такую разбор причин общей бедой
   * не считает, и выпуск идёт дальше. Чтобы проверить остановку, сюда
   * передают то, что пишет упавший браузер или умершее хранилище.
   */
  renderError?: string;
  /** Номера отправок в хранилище (сквозные), которые не удались. */
  putFails?: number[];
  /** Номера попыток записать файл в базу (сквозные), которые не удались. */
  createFails?: number[];
  /** Вызывается перед каждой отрисовкой: можно отменить выпуск или уронить мир. */
  beforeRender?: (n: number, world: World) => void;
}

export interface Calls {
  render: number;
  put: number;
  removed: number;
  created: number;
}

/**
 * Очередь с правилами BullMQ: меньший priority — раньше, при равном
 * приоритете порядок постановки. Этого достаточно, чтобы проверить
 * не значения приоритетов, а фактический порядок, в котором пакеты
 * доходят до конца.
 */
export class FakeQueue {
  private seq = 0;
  private waiting: { id: string; data: unknown; priority: number; seq: number }[] = [];

  async addBulk(
    items: { name: string; data: unknown; opts: { jobId: string; priority?: number } }[],
  ): Promise<void> {
    for (const item of items) {
      // BullMQ молча пропускает задачу с уже занятым идентификатором.
      if (this.waiting.some((w) => w.id === item.opts.jobId)) continue;
      this.waiting.push({
        id: item.opts.jobId,
        data: item.data,
        priority: item.opts.priority ?? 0,
        seq: this.seq++,
      });
    }
  }

  async getJob(id: string) {
    const found = this.waiting.find((w) => w.id === id);
    if (!found) return undefined;
    return {
      remove: async () => {
        this.waiting = this.waiting.filter((w) => w !== found);
      },
    };
  }

  /** Следующая задача по правилам BullMQ, или null. */
  take(): { id: string; data: unknown } | null {
    if (this.waiting.length === 0) return null;
    let best = 0;
    for (let i = 1; i < this.waiting.length; i++) {
      const a = this.waiting[i];
      const b = this.waiting[best];
      if (a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq)) best = i;
    }
    return this.waiting.splice(best, 1)[0];
  }

  get size(): number {
    return this.waiting.length;
  }
}

export class World {
  readonly jobs: JobRec[] = [];
  readonly rows: RowRec[] = [];
  readonly files: FileRec[] = [];
  readonly failures: FailureRec[] = [];
  readonly documents: { id: string; orgId: string; deletedAt: null; sheets: unknown[] }[] = [];
  readonly calls: Calls = { render: 0, put: 0, removed: 0, created: 0 };
  readonly queue = new FakeQueue();

  /** Задания, дошедшие до конца, в порядке завершения. */
  readonly finished: string[] = [];

  plan: 'free' | 'paid';
  /** Убить процесс, когда воркер собрался записать этот прогресс. */
  crashAtDone: number | null = null;
  /** Ронять любую запись в базу: так выглядит недоступная база. */
  dbDown = false;

  readonly prisma: Record<string, unknown>;
  readonly processor: GenerationProcessor;
  readonly service: GenerationService;

  private nextFile = 1;
  private createAttempts = 0;

  constructor(private readonly options: WorldOptions = {}) {
    this.plan = options.plan ?? 'free';
    this.prisma = this.buildPrisma();

    const renderer = {
      render: async () => {
        this.calls.render++;
        this.options.beforeRender?.(this.calls.render, this);
        if (this.options.renderFails?.includes(this.calls.render)) {
          throw new Error(this.options.renderError ?? 'страница не отрисовалась');
        }
        return Buffer.from(`pdf-${this.calls.render}`);
      },
    };

    const storage = {
      put: async () => {
        this.calls.put++;
        if (this.options.putFails?.includes(this.calls.put)) {
          throw new Error('хранилище недоступно');
        }
      },
      remove: async () => {
        this.calls.removed++;
      },
      getStream: async () => Readable.from([Buffer.from('%PDF-1.4')]),
    };

    const config = {
      get: (key: string) => {
        if (key === 'SESSION_SECRET') return 'a'.repeat(32);
        if (key === 'ORG_ACTIVE_JOBS') return Number(process.env.ORG_ACTIVE_JOBS ?? 3);
        if (key === 'FREE_DOCUMENT_LIMIT') return Number(process.env.FREE_DOCUMENT_LIMIT ?? 50);
        if (key === 'PRINT_MERGE_LIMIT_FILES') return 300;
        if (key === 'PRINT_MERGE_LIMIT_MB') return 150;
        return '';
      },
    };

    this.service = new GenerationService(
      this.prisma as never,
      { bonusDocuments: async () => 0 } as never,
      config as never,
    );

    this.processor = new GenerationProcessor(
      this.prisma as never,
      storage as never,
      config as never,
      renderer as never,
      this.service,
      // Подписи в этих тестах нет: они про очередь и базу, а не про сертификат.
      { signIfConfigured: async (bytes: Buffer) => ({ bytes, signed: false }) } as never,
    );
    (this.processor as unknown as { queue: FakeQueue }).queue = this.queue;

    if (options.rows !== undefined) this.addDocument('doc-1', options.rows);
  }

  /** Заводит документ с отмеченными строками. */
  addDocument(documentId: string, rowCount: number): void {
    this.documents.push({
      id: documentId,
      orgId: 'org-1',
      deletedAt: null,
      sheets: [{ layout: [{ type: 'text' }] }],
    });
    for (let i = 0; i < rowCount; i++) {
      this.rows.push({
        id: `${documentId}-row-${i + 1}`,
        documentId,
        position: i,
        data: { name: `Участник ${i + 1}`, email: `p${i + 1}@example.test` },
        checked: true,
        lastFileId: null,
      });
    }
  }

  job(id = this.jobs[0]?.id): JobRec {
    const found = this.jobs.find((j) => j.id === id);
    if (!found) throw new Error(`нет задания ${id}`);
    return found;
  }

  /** Сколько документов организация израсходовала — тем же счётом, что в проверке лимита. */
  used(): number {
    return this.files.filter((f) => f.orgId === 'org-1' && f.kind === 'generated').length;
  }

  /** Ставит пакет в очередь тем же путём, каким это делает контроллер. */
  async start(documentId = 'doc-1'): Promise<JobRec> {
    const { job, rowIds } = await this.service.start('org-1', documentId, 'pdf');
    await this.processor.enqueue(job, rowIds);
    return this.job(job.id);
  }

  /** Продолжает прерванный выпуск — тоже как контроллер. */
  async resume(jobId: string): Promise<void> {
    const { job, rowIds } = await this.service.resume('org-1', jobId);
    if (rowIds.length > 0) await this.processor.enqueue(job, rowIds);
  }

  /** Обрабатывает одну часть из очереди. false — очередь пуста. */
  async step(): Promise<boolean> {
    const next = this.queue.take();
    if (!next) return false;
    await (this.processor as unknown as { process(data: unknown): Promise<void> }).process(
      next.data,
    );
    return true;
  }

  /** Дорабатывает очередь до конца. */
  async drain(limit = 10_000): Promise<void> {
    for (let i = 0; i < limit; i++) {
      if (!(await this.step())) return;
    }
    throw new Error('очередь не кончается');
  }

  private buildPrisma(): Record<string, unknown> {
    const guard = () => {
      if (this.dbDown) throw new Error('база недоступна');
    };

    const jobs = {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const job = this.jobs.find((j) => j.id === where.id);
        if (!job) return null;
        return { ...job, document: { pageWidthMm: 210, pageHeightMm: 297 } };
      },
      findFirst: async ({ where }: { where: Where }) => {
        const job = this.jobs.find((j) => matches(j as never, where));
        return job ? { ...job } : null;
      },
      findMany: async ({ where }: { where: Where }) =>
        this.jobs.filter((j) => matches(j as never, where)).map((j) => ({ ...j })),
      count: async ({ where }: { where: Where }) =>
        this.jobs.filter((j) => matches(j as never, where)).length,
      create: async ({ data }: { data: Partial<JobRec> }) => {
        const job: JobRec = {
          id: `job-${this.jobs.length + 1}`,
          orgId: 'org-1',
          documentId: 'doc-1',
          format: 'pdf',
          status: 'queued',
          total: 0,
          done: 0,
          failed: 0,
          error: null,
          chunks: 0,
          attempt: 1,
          createdAt: new Date(),
          startedAt: null,
          finishedAt: null,
          ...data,
        };
        this.jobs.push(job);
        return { ...job };
      },
      update: async ({
        where,
        data,
        select,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
        select?: unknown;
      }) => {
        guard();
        const job = this.jobs.find((j) => j.id === where.id);
        if (!job) throw new Error('нет такого задания');
        if (this.crashAtDone !== null && data.done === this.crashAtDone) {
          throw new Crash('воркер убит по памяти');
        }
        applyData(job as never, data);
        return select ? { status: job.status } : { ...job };
      },
      updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        guard();
        const found = this.jobs.filter((j) => matches(j as never, where));
        for (const job of found) {
          applyData(job as never, data);
          if (job.status === 'done' || job.status === 'failed') {
            if (!this.finished.includes(job.id)) this.finished.push(job.id);
          }
        }
        return { count: found.length };
      },
    };

    return {
      generationJob: jobs,
      document: {
        findFirst: async ({ where }: { where: Where }) => {
          const doc = this.documents.find((d) => matches(d as never, where));
          return doc ? { ...doc } : null;
        },
      },
      recipientRow: {
        findMany: async ({ where }: { where: Where }) =>
          this.rows
            .filter((r) => matches(r as never, where))
            .sort((a, b) => a.position - b.position)
            .map((r) => ({ ...r })),
        count: async ({ where }: { where: Where }) =>
          this.rows.filter((r) => matches(r as never, where)).length,
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { lastFileId: string };
        }) => {
          guard();
          const row = this.rows.find((r) => r.id === where.id);
          if (!row) throw new Error('нет такой строки');
          row.lastFileId = data.lastFileId;
          return { ...row };
        },
      },
      file: {
        // Воркер спрашивает, свободен ли публичный код, до печати листа.
        findUnique: async ({ where }: { where: { id?: string; publicCode?: string } }) =>
          this.files.find((f) =>
            where.id !== undefined ? f.id === where.id : f.publicCode === where.publicCode,
          ) ?? null,
        findMany: async ({ where }: { where: Where }) =>
          this.files
            .filter((f) => matches(f as never, where))
            .map((f) => ({
              ...f,
              row: { data: this.rows.find((r) => r.id === f.rowId)?.data ?? {} },
            })),
        count: async ({ where }: { where: Where }) =>
          this.files.filter((f) => matches(f as never, where)).length,
        create: async ({ data }: { data: Partial<FileRec> }) => {
          guard();
          this.createAttempts++;
          if (this.options.createFails?.includes(this.createAttempts)) {
            throw new Error('база отказала на записи файла');
          }
          // Ровно то ограничение, что стоит в базе: (job_id, row_id) уникальны.
          if (this.files.some((f) => f.jobId === data.jobId && f.rowId === data.rowId)) {
            throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
          }
          this.calls.created++;
          const file: FileRec = {
            id: data.id ?? `file-${this.nextFile++}`,
            orgId: 'org-1',
            documentId: null,
            jobId: null,
            rowId: null,
            kind: 'generated',
            s3Key: '',
            mime: 'application/pdf',
            sizeBytes: 0,
            publicId: `public-${this.nextFile}`,
            originalName: '',
            deletedAt: null,
            createdAt: new Date(),
            ...data,
          };
          this.files.push(file);
          return { ...file };
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          guard();
          const file = this.files.find((f) => f.id === where.id);
          if (!file) throw new Error('нет такого файла');
          applyData(file as never, data);
          return { ...file };
        },
        delete: async ({ where }: { where: { id: string } }) => {
          guard();
          const i = this.files.findIndex((f) => f.id === where.id);
          if (i < 0) throw new Error('нет такого файла');
          return this.files.splice(i, 1)[0];
        },
        deleteMany: async ({ where }: { where: Where }) => {
          guard();
          const keep = this.files.filter((f) => !matches(f as never, where));
          const removed = this.files.length - keep.length;
          this.files.length = 0;
          this.files.push(...keep);
          return { count: removed };
        },
      },
      generationRowFailure: {
        findMany: async ({ where }: { where: Where }) =>
          this.failures.filter((f) => matches(f as never, where)).map((f) => ({ ...f })),
        count: async ({ where }: { where: Where }) =>
          this.failures.filter((f) => matches(f as never, where)).length,
        upsert: async ({
          where,
          create,
        }: {
          where: { jobId_rowId: { jobId: string; rowId: string } };
          create: FailureRec;
        }) => {
          guard();
          const { jobId, rowId } = where.jobId_rowId;
          const existing = this.failures.find((f) => f.jobId === jobId && f.rowId === rowId);
          if (existing) {
            existing.message = create.message;
            return { ...existing };
          }
          const rec: FailureRec = { ...create, createdAt: new Date() };
          this.failures.push(rec);
          return { ...rec };
        },
        deleteMany: async ({ where }: { where: Where }) => {
          guard();
          const keep = this.failures.filter((f) => !matches(f as never, where));
          const removed = this.failures.length - keep.length;
          this.failures.length = 0;
          this.failures.push(...keep);
          return { count: removed };
        },
      },
      organization: { findUnique: async () => ({ id: 'org-1', plan: this.plan }) },
      $executeRaw: async () => 1,
      $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(this.prisma),
    };
  }
}
