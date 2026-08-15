import { describe, expect, it } from 'vitest';
import { BackupWatchService } from './backup-watch.service';

/*
 * Сторож резервных копий. Заведён после того, как копии не снимались
 * ни одной ночи и никто об этом не знал. Проверяем ровно границу между
 * «молчим» и «бьём тревогу»: ошибка в первую сторону возвращает нас
 * к тому самому молчаливому провалу, во вторую — приучает не читать
 * наши письма.
 */

interface Setup {
  newest?: { key: string; lastModified: Date; size: number } | null;
  throws?: boolean;
  bucket?: string;
  alertEmail?: string;
}

function serviceWith(s: Setup) {
  const sent: Array<{ to: string; subject: string; html: string }> = [];

  const config = {
    get: (key: string) => {
      if (key === 'BACKUP_S3_BUCKET') return s.bucket ?? 's3://vruchay-backups';
      if (key === 'ALERT_EMAIL') return s.alertEmail ?? 'operator@example.test';
      return '';
    },
  };
  const storage = {
    newestObject: async () => {
      if (s.throws) throw new Error('AccessDenied');
      return s.newest ?? null;
    },
  };
  const mail = {
    sendService: async (to: string, subject: string, html: string) => {
      sent.push({ to, subject, html });
    },
  };

  return { svc: new BackupWatchService(config as never, storage as never, mail as never), sent };
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const good = (h: number) => ({ key: `db/vruchay-2026.sql.gz.age`, lastModified: hoursAgo(h), size: 5_000_000 });

describe('когда всё в порядке — молчим', () => {
  it('копия ночная', async () => {
    const { svc, sent } = serviceWith({ newest: good(6) });
    const state = await svc.run();
    expect(state.ok).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('копия суточной давности с запасом на задержку', async () => {
    // Порог 26 часов, а не 24: копия снимается в 03:00, и ровно суточная
    // граница срабатывала бы от любой задержки дампа.
    const { svc, sent } = serviceWith({ newest: good(25) });
    expect((await svc.run()).ok).toBe(true);
    expect(sent).toHaveLength(0);
  });
});

describe('когда копий нет или они старые — пишем', () => {
  it('копия старше порога', async () => {
    const { svc, sent } = serviceWith({ newest: good(30) });
    const state = await svc.run();
    expect(state.ok).toBe(false);
    expect(state.reason).toMatch(/30 ч назад/);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/копии не в порядке/);
  });

  it('копий нет вовсе', async () => {
    const { svc, sent } = serviceWith({ newest: null });
    const state = await svc.run();
    expect(state.reason).toMatch(/нет ни одной копии/);
    expect(sent).toHaveLength(1);
  });

  it('хранилище недоступно — это тоже отсутствие копий', async () => {
    // Именно так выглядит отобранный ключ доступа, и молчать об этом нельзя.
    const { svc, sent } = serviceWith({ throws: true });
    const state = await svc.run();
    expect(state.ok).toBe(false);
    expect(state.reason).toMatch(/AccessDenied/);
    expect(sent).toHaveLength(1);
  });

  it('копия свежая, но пустая', async () => {
    // Упавший pg_dump даёт маленький «успешно» зашифрованный файл.
    const { svc, sent } = serviceWith({
      newest: { key: 'db/x.age', lastModified: hoursAgo(1), size: 200 },
    });
    const state = await svc.run();
    expect(state.reason).toMatch(/подозрительно мала/);
    expect(sent).toHaveLength(1);
  });
});

describe('письмо', () => {
  it('содержит, что именно проверить на сервере', async () => {
    // Тревога без подсказки, что делать, — это просто повод для тревоги.
    const { svc, sent } = serviceWith({ newest: good(40) });
    await svc.run();
    expect(sent[0].html).toContain('vruchay-backup.log');
    expect(sent[0].html).toContain('crontab -l');
  });

  it('без адреса получателя не падает', async () => {
    const { svc, sent } = serviceWith({ newest: good(40), alertEmail: '' });
    await expect(svc.run()).resolves.toMatchObject({ ok: false });
    expect(sent).toHaveLength(0);
  });
});

describe('имя бакета', () => {
  it('понимает и «s3://имя», и просто «имя»', async () => {
    // В настройках пишут и так и так, и падать из-за этого нельзя.
    for (const bucket of ['s3://vruchay-backups', 'vruchay-backups', 's3://vruchay-backups/db']) {
      const { svc } = serviceWith({ newest: good(2), bucket });
      await expect(svc.run()).resolves.toMatchObject({ ok: true });
    }
  });
});
