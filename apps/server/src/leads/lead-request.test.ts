import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { leadSchema } from './leads.dto';
import { LeadsService } from './leads.service';

/*
 * Заявка «обсудить условия».
 *
 * Единственный вход для организации: цен на сайте нет, посчитать себе
 * стоимость человек не может. Поэтому здесь проверяется не форма ответа,
 * а то, что заявка не теряется и доносит сказанное: пропавшая заявка —
 * это не ошибка в журнале, а неслучившийся клиент.
 */

const valid = {
  orgName: 'Федерация лёгкой атлетики области',
  contact: 'Наталья Сергеевна',
  email: 'Secretary@Example.RU',
  volume: 'to20k',
  eventKinds: ['competitions', 'education'],
  callTime: 'morning',
  consent: true,
};

describe('проверка заявки на границе', () => {
  it('принимает заполненную форму и приводит почту к нижнему регистру', () => {
    const parsed = leadSchema.parse(valid);
    expect(parsed.email).toBe('secretary@example.ru');
    expect(parsed.volume).toBe('to20k');
  });

  it('без согласия на обработку данных заявка не принимается', () => {
    const { consent: _, ...withoutConsent } = valid;
    const res = leadSchema.safeParse(withoutConsent);
    expect(res.success).toBe(false);
  });

  it('снятая галочка согласия — тоже отказ', () => {
    expect(leadSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
  });

  it('тип мероприятий принимается только из списка', () => {
    expect(leadSchema.safeParse({ ...valid, eventKinds: ['<script>'] }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, eventKinds: [] }).success).toBe(true);
  });

  it('объём и время звонка — тоже по списку, а не свободным текстом', () => {
    expect(leadSchema.safeParse({ ...valid, volume: '20000 штук' }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, callTime: 'ночью' }).success).toBe(false);
  });

  it('организацию и контакт без почты не принимаем', () => {
    expect(leadSchema.safeParse({ ...valid, email: 'не почта' }).success).toBe(false);
  });
});

/*
 * Что человек читает в ответ на отказ.
 *
 * Форма показывает `message` из ответа сервера: останется там общая фраза —
 * человек увидит «что-то не так» и уйдёт, не поняв, какое поле поправить.
 */
function refusal(body: unknown): string {
  try {
    new ZodValidationPipe(leadSchema).transform(body, { type: 'body' } as never);
  } catch (e) {
    return ((e as BadRequestException).getResponse() as { message: string }).message;
  }
  throw new Error('ожидался отказ, а его не было');
}

describe('отказ объясняет причину', () => {
  it('называет пропущенное согласие словами', () => {
    const { consent: _, ...withoutConsent } = valid;
    expect(refusal(withoutConsent)).toContain('согласия на обработку данных');
  });

  it('называет неверную почту', () => {
    expect(refusal({ ...valid, email: 'не почта' })).toContain('адрес электронной почты');
  });

  it('заполненную форму пропускает', () => {
    const parsed = new ZodValidationPipe(leadSchema).transform(valid, { type: 'body' } as never);
    expect(parsed).toMatchObject({ orgName: valid.orgName, consent: true });
  });
});

function serviceWith(created: { id: string } = { id: 'lead-1' }) {
  const create = vi.fn(async () => created);
  const prisma = {
    lead: { create },
    sender: { findFirst: async () => ({ orgId: 'org-1', email: 'owner@example.test' }) },
  };
  const sendNotice = vi.fn(async () => undefined);
  const mail = { sendNotice };
  // Выставление счетов включено: проверяем, что счёт не уходит из-за
  // отсутствия согласованной цены, а не из-за отключённой интеграции.
  const invoices = { configured: true, issueAndSend: vi.fn(async () => undefined) };
  const service = new LeadsService(prisma as never, mail as never, invoices as never);
  return { service, create, sendNotice, invoices };
}

describe('приём заявки', () => {
  it('складывает тип мероприятий, время звонка и согласие в заявку', async () => {
    const { service, create } = serviceWith();
    await service.create(leadSchema.parse(valid), {});

    const data = create.mock.calls[0][0].data;
    expect(data.volume).toBe('До 20 000 документов в год');
    // Колонки, а не только текст: по ним заявки ищут и сортируют.
    expect(data.eventKinds).toEqual(['competitions', 'education']);
    expect(data.callTime).toBe('morning');
    expect(data.consentTextVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.comment).toContain('Соревнования и турниры');
    expect(data.comment).toContain('Обучение, курсы, семинары');
    expect(data.comment).toContain('Утром, с 9 до 12 по Москве');
    expect(data.comment).toMatch(/Согласие на обработку данных: дано, редакция текста \d{4}-\d{2}-\d{2}/);
  });

  it('комментарий человека остаётся первым и не теряется', async () => {
    const { service, create } = serviceWith();
    await service.create(leadSchema.parse({ ...valid, comment: 'Успеть к 12 мая' }), {});

    const comment = create.mock.calls[0][0].data.comment as string;
    expect(comment.startsWith('Успеть к 12 мая')).toBe(true);
  });

  it('уведомление на почту повторяет то же самое', async () => {
    const { service, sendNotice } = serviceWith();
    await service.create(leadSchema.parse(valid), {});
    // Письмо уходит после сохранения и не держит ответ клиенту.
    await vi.waitFor(() => expect(sendNotice).toHaveBeenCalled());

    const [, , subject, body] = sendNotice.mock.calls[0];
    expect(subject).toContain('Федерация лёгкой атлетики области');
    expect(body).toContain('До 20 000 документов в год');
    expect(body).toContain('Соревнования и турниры');
  });

  it('заполненную ловушку не сохраняет вовсе', async () => {
    const { service, create } = serviceWith();
    await expect(
      service.create(leadSchema.parse({ ...valid, website: 'http://spam' }), {}),
    ).resolves.toEqual({ ok: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('счёт сам по себе не выставляется: цену называют в разговоре', async () => {
    const { service, invoices } = serviceWith();
    // ИНН есть, выставление счетов настроено — не хватает только тарифа
    // с ценой, а публичная форма его и не присылает.
    await service.create(leadSchema.parse({ ...valid, inn: '7707083893' }), {});
    expect(invoices.issueAndSend).not.toHaveBeenCalled();
  });
});
