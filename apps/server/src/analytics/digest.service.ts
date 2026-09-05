import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { escapeHtml } from '../mail/mail-template';
import { baseUrl, type Env } from '../config/env';
import { MetricsService, type MonthNumbers } from './metrics.service';
import { SENT_STATUSES, issuedAnywhere } from './scope';
import { monthRange, mskDay } from './activation';

export const DIGEST_QUEUE = 'digest';

/**
 * Отметка в журнале о том, что сводка за месяц ушла.
 *
 * Она же защита от повторной отправки: расписание живёт в Redis, а Redis
 * переживает не всё, и перезапуск воркера первого числа не должен
 * означать второе такое же письмо. Отдельного поля в базе для этого
 * не заводим — журнал ровно для того и есть, чтобы хранить то, у чего
 * есть последствия снаружи, а ушедшее письмо к таким последствиям
 * относится.
 */
const DIGEST_ACTION = 'analytics.digest';

/**
 * Ежемесячная сводка владельцу аккаунта.
 *
 * Транзакционное письмо о его собственной организации, а не рассылка:
 * уходит мимо шаблонов и мимо журнала выдачи, тем же путём, что письмо
 * с подтверждением адреса. Рекламы в нём нет, поэтому и согласия на неё
 * оно не требует; отписка от рекламных писем к нему не относится.
 *
 * Смысл письма — не отчётность, а разговор. «За август вы выпустили 340
 * документов, 96 из них проверяли по QR» — это и повод вернуться,
 * и готовый довод на продление.
 */
@Injectable()
export class DigestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DigestService.name);
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly mail: MailService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get('RUN_WORKER', { infer: true })) return;

    this.connection = new IORedis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(DIGEST_QUEUE, { connection: this.connection });
    this.worker = new Worker(DIGEST_QUEUE, () => this.run(), {
      connection: this.connection,
      concurrency: 1,
    });

    /*
     * Первого числа в девять утра по Москве. Час выбран не случайно:
     * письмо об итогах месяца человек должен прочесть на работе,
     * а не увидеть уведомление ночью.
     *
     * Имя расписания постоянное — одинаковое заменяет прежнее, поэтому
     * перезапуски не размножают задание.
     */
    try {
      await this.queue.upsertJobScheduler(
        'digest-monthly',
        { pattern: '0 0 9 1 * *', tz: 'Europe/Moscow' },
        { name: 'send', opts: { removeOnComplete: 12, removeOnFail: 12 } },
      );
    } catch (err) {
      // Недоступный при старте Redis не должен мешать приложению подняться:
      // расписание восстановится при следующем запуске.
      this.logger.error(
        `Не удалось поставить месячную сводку: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  /**
   * Разослать сводки за прошлый месяц.
   *
   * Вынесено отдельно от расписания, чтобы можно было запустить руками.
   * Организации без единого события за месяц пропускаем: письмо «выпущено
   * 0, разослано 0» не сообщает ничего и учит не открывать следующее.
   */
  async run(now = new Date()): Promise<{ sent: number; skipped: number }> {
    const { from, to } = monthRange(now, 1);
    const period = periodKey(from);
    const orgIds = await this.activeOrgs(from, to);

    let sent = 0;
    let skipped = 0;

    for (const orgId of orgIds) {
      const already = await this.prisma.auditEvent.findFirst({
        where: { orgId, action: DIGEST_ACTION, targetType: 'month', targetId: period },
        select: { id: true },
      });
      if (already) {
        skipped += 1;
        continue;
      }

      const delivered = await this.sendFor(orgId, from, to);
      if (delivered) sent += 1;
      else skipped += 1;
    }

    if (sent > 0 || skipped > 0) {
      this.logger.log(`Месячная сводка за ${period}: отправлено ${sent}, пропущено ${skipped}`);
    }
    return { sent, skipped };
  }

  /**
   * Организации, у которых за месяц что-то происходило.
   *
   * Двумя группировками, а не перебором всех организаций с подсчётом
   * по каждой: клиентов будет сотня, а событий у них — сотни тысяч.
   */
  private async activeOrgs(from: Date, to: Date): Promise<string[]> {
    const [issued, mailed] = await Promise.all([
      this.prisma.file.groupBy({
        by: ['orgId'],
        where: { ...issuedAnywhere(), createdAt: { gte: from, lt: to } },
        _count: { _all: true },
      }),
      this.prisma.email.groupBy({
        by: ['orgId'],
        where: { status: { in: [...SENT_STATUSES] }, sentAt: { gte: from, lt: to } },
        _count: { _all: true },
      }),
    ]);

    return [...new Set([...issued.map((f) => f.orgId), ...mailed.map((e) => e.orgId)])];
  }

  /**
   * Одна сводка: посчитать, отправить владельцам, отметить в журнале.
   *
   * Неудача с одной организацией не отменяет остальные: письмо, которое
   * не ушло в августе, не повод не разослать сводки всем прочим.
   */
  private async sendFor(orgId: string, from: Date, to: Date): Promise<boolean> {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          name: true,
          members: {
            where: { role: 'owner' },
            select: { user: { select: { email: true } } },
          },
        },
      });
      if (!org) return false;

      const owners = org.members.map((m) => m.user.email).filter(Boolean);
      if (owners.length === 0) {
        this.logger.warn(`Сводка не отправлена: у организации ${orgId} нет владельца`);
        return false;
      }

      const [numbers, verificationsTotal] = await Promise.all([
        this.metrics.forMonth(orgId, from, to),
        this.metrics.verificationsTotal(orgId),
      ]);

      const letter = digestLetter({
        orgName: org.name,
        numbers,
        verificationsTotal,
        analyticsUrl: `${baseUrl(this.config.get('PUBLIC_URL', { infer: true }))}/analytics`,
      });

      for (const address of owners) {
        await this.mail.sendService(address, letter.subject, letter.html);
      }

      // Адресов в журнале нет намеренно: запись отвечает на вопрос
      // «сводку за август отправляли?», а не «кому именно».
      await this.prisma.auditEvent.create({
        data: {
          orgId,
          action: DIGEST_ACTION,
          summary: `Отправлена сводка за ${numbers.title}`,
          targetType: 'month',
          targetId: periodKey(from),
          meta: {
            issued: numbers.issued,
            mailed: numbers.mailed,
            verifiedFiles: numbers.verifiedFiles,
            recipients: owners.length,
          },
        },
      });

      return true;
    } catch (err) {
      // В журнале сервера — организация и причина, но не адреса:
      // персональные данные в логи не попадают.
      this.logger.error(
        `Сводка для организации ${orgId} не ушла: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * То же письмо себе — посмотреть, что придёт владельцу.
   *
   * Адрес берётся из сессии и параметром не приходит: иначе кнопка
   * «прислать сводку» превратилась бы в способ отправить письмо
   * на чужой ящик от нашего имени.
   */
  async preview(orgId: string, to: string, now = new Date()): Promise<MonthNumbers> {
    const month = monthRange(now, 1);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });

    const [numbers, verificationsTotal] = await Promise.all([
      this.metrics.forMonth(orgId, month.from, month.to),
      this.metrics.verificationsTotal(orgId),
    ]);

    const letter = digestLetter({
      orgName: org?.name ?? '',
      numbers,
      verificationsTotal,
      analyticsUrl: `${baseUrl(this.config.get('PUBLIC_URL', { infer: true }))}/analytics`,
    });

    await this.mail.sendService(to, letter.subject, letter.html);
    return numbers;
  }
}

/** «2026-08» — период, за который сводка уже уходила. */
export function periodKey(from: Date): string {
  return mskDay(from).slice(0, 7);
}

/**
 * Текст сводки.
 *
 * Чистая функция: письмо — это то, что увидит человек, и проверять его
 * тестом нужно без базы, очереди и почтового шлюза.
 *
 * Все подставляемые значения экранируются: название организации человек
 * вводит сам, и однажды там окажется угловая скобка.
 */
export function digestLetter(params: {
  orgName: string;
  numbers: MonthNumbers;
  verificationsTotal: number;
  analyticsUrl: string;
}): { subject: string; html: string } {
  const { numbers, verificationsTotal } = params;
  const e = escapeHtml;

  const rows: [string, string][] = [
    ['Выпущено документов', String(numbers.issued)],
    ['Разослано писем', String(numbers.mailed)],
    [
      'Документов проверяли по QR',
      `${numbers.verifiedFiles} (всего проверок за всё время — ${verificationsTotal})`,
    ],
  ];

  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#5f6b64">${e(label)}</td>` +
        `<td style="padding:6px 0;font-size:18px;font-weight:600">${e(value)}</td></tr>`,
    )
    .join('');

  return {
    subject: `Вручай: итоги за ${numbers.title}`,
    html:
      `<div style="font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2420">` +
      `<p>Что происходило у организации «${e(params.orgName)}» за ${e(numbers.title)}.</p>` +
      `<table style="border-collapse:collapse;margin:16px 0">${table}</table>` +
      `<p style="color:#5f6b64">Проверка по QR — единственное свидетельство, что выданный ` +
      `документ живёт: его сканировали работодатель, приёмная комиссия или судья. ` +
      `Кто и откуда проверял, мы не собираем.</p>` +
      `<p><a href="${e(params.analyticsUrl)}" style="color:#2f6b4f">Открыть «Аналитику» в кабинете</a></p>` +
      `<p style="font-size:13px;color:#5f6b64">Это служебное письмо о вашей организации, ` +
      `а не рассылка: оно приходит раз в месяц владельцу аккаунта.</p>` +
      `</div>`,
  };
}
