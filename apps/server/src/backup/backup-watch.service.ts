import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';
import type { Env } from '../config/env';

export const BACKUP_WATCH_QUEUE = 'backup-watch';

/**
 * Копия считается просроченной через 26 часов.
 *
 * Не 24: копия снимается в 03:00, и ровно суточный порог срабатывал бы
 * от любой задержки — от медленного дампа до перевода часов. Два часа
 * запаса убирают ложные тревоги, не убирая смысла проверки.
 */
const STALE_AFTER_HOURS = 26;
/** Меньше этого копия не бывает: пустой файл — не копия, а ложное спокойствие. */
const MIN_SIZE_BYTES = 4096;

interface BackupState {
  ok: boolean;
  reason: string;
  key?: string;
  ageHours?: number;
  sizeBytes?: number;
}

/**
 * Сторож резервных копий.
 *
 * Заведён после того, как копии не снимались ни одной ночи, и никто
 * об этом не знал: скрипт падал, писал в журнал и завершался, а журнал
 * никто не открывает. Учебное восстановление тогда прошло успешно
 * только потому, что запускалось руками.
 *
 * Отсюда устройство: проверяем **не то, что скрипт отработал**, а то,
 * что в хранилище лежит свежий файл нужного размера. Это единственное,
 * что имеет значение в день, когда копия понадобится, и это же ловит
 * случай «задание вообще не запускалось», который проверкой кода
 * возврата не поймать.
 *
 * Письмо шлём при каждой неудачной проверке, а не один раз: сломанные
 * копии — это то немногое, о чём лучше напомнить лишний раз. Молчание
 * при этом означает «всё хорошо», и в этом весь смысл.
 */
@Injectable()
export class BackupWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupWatchService.name);
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get('RUN_WORKER', { infer: true })) return;

    const bucket = this.config.get('BACKUP_S3_BUCKET', { infer: true });
    if (!bucket) {
      // Ни бакета, ни копий — в разработке это нормально. Молча
      // не проверяем, но и в тревогу это не превращаем.
      this.logger.log('BACKUP_S3_BUCKET не задан — сторож копий не запущен');
      return;
    }

    this.connection = new IORedis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(BACKUP_WATCH_QUEUE, { connection: this.connection });
    this.worker = new Worker(BACKUP_WATCH_QUEUE, () => this.run(), {
      connection: this.connection,
      concurrency: 1,
    });

    try {
      // В 09:00 по времени сервера: проверка нужна тогда, когда есть кому
      // прочитать письмо. Ночная тревога до утра всё равно пролежит
      // непрочитанной, а разбудить она может зря.
      await this.queue.upsertJobScheduler(
        'backup-watch-daily',
        { pattern: '0 0 9 * * *' },
        { name: 'check', opts: { removeOnComplete: 30, removeOnFail: 30 } },
      );
    } catch (err) {
      this.logger.error(
        `Не удалось поставить проверку копий: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  /** Вынесено отдельно от расписания, чтобы можно было проверить руками. */
  async run(): Promise<BackupState> {
    const state = await this.check();

    if (state.ok) {
      this.logger.log(`Резервная копия свежая: ${state.key} (${state.ageHours} ч назад)`);
      return state;
    }

    this.logger.error(`Резервные копии: ${state.reason}`);
    await this.alert(state);
    return state;
  }

  private async check(): Promise<BackupState> {
    const bucket = bucketName(this.config.get('BACKUP_S3_BUCKET', { infer: true }) ?? '');
    if (!bucket) return { ok: false, reason: 'не задан бакет для копий' };

    let newest: Awaited<ReturnType<StorageService['newestObject']>>;
    try {
      newest = await this.storage.newestObject(bucket, 'db/');
    } catch (err) {
      // Недоступное хранилище — это тоже отсутствие копий, и молчать
      // об этом нельзя: именно так выглядит отобранный ключ доступа.
      return {
        ok: false,
        reason: `не удалось прочитать хранилище копий: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (!newest) return { ok: false, reason: 'в хранилище нет ни одной копии' };

    const ageHours = Math.round((Date.now() - newest.lastModified.getTime()) / 3_600_000);

    if (ageHours > STALE_AFTER_HOURS) {
      return {
        ok: false,
        reason: `последняя копия сделана ${ageHours} ч назад`,
        key: newest.key,
        ageHours,
        sizeBytes: newest.size,
      };
    }

    if (newest.size < MIN_SIZE_BYTES) {
      return {
        ok: false,
        reason: `последняя копия подозрительно мала: ${newest.size} байт`,
        key: newest.key,
        ageHours,
        sizeBytes: newest.size,
      };
    }

    return { ok: true, reason: '', key: newest.key, ageHours, sizeBytes: newest.size };
  }

  private async alert(state: BackupState): Promise<void> {
    const to = this.config.get('ALERT_EMAIL', { infer: true });
    if (!to) {
      this.logger.error('ALERT_EMAIL не задан — сообщить о проблеме с копиями некому');
      return;
    }

    try {
      await this.mail.sendService(
        to,
        'Вручай: резервные копии не в порядке',
        `<p style="font-size:15px">Проверка резервных копий базы не прошла.</p>
         <p><b>${escape(state.reason)}</b></p>
         ${state.key ? `<p>Последняя найденная копия: <code>${escape(state.key)}</code></p>` : ''}
         <p style="color:#5f6b64;font-size:13px">
           Что проверить на сервере:<br>
           1. журнал: <code>tail -50 /var/log/vruchay-backup.log</code><br>
           2. запуск руками: <code>/opt/vruchay/src/scripts/backup.sh</code><br>
           3. расписание: <code>crontab -l</code>
         </p>
         <p style="color:#5f6b64;font-size:13px">
           Это письмо приходит, только когда что-то не так. Молчание означает,
           что копии снимаются.
         </p>`,
      );
      this.logger.log(`Сообщение о проблеме с копиями отправлено на ${to}`);
    } catch (err) {
      this.logger.error(
        `Не удалось отправить сообщение о копиях: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** `s3://vruchay-backups` → `vruchay-backups`. В настройках пишут и так и так. */
function bucketName(value: string): string {
  return value.replace(/^s3:\/\//, '').replace(/\/.*$/, '').trim();
}

function escape(value: string): string {
  return value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
