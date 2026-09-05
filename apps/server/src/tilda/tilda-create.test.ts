import { describe, expect, it } from 'vitest';
import { parseTildaForm } from './tilda-create';

/** Тело, какое присылает Тильда: содержательные поля вперемешку со служебными. */
const tildaBody = {
  mask_name: 'Кузьмина-Караваева Анна',
  mask_email: 'anna@example.ru',
  mask_place: 'Первое место',
  secure: '83205beb-3c83-44dc-b256-b1b05be9d03b',
  doc_id: '0ad0d9b2-6f1a-4f0e-9a5a-2b2b6a5f8c11',
  consent: 'Согласен на обработку персональных данных',
  tranid: '123456:78901234',
  formid: 'form987654321',
  'formservices[]': 'webhook',
  COOKIES: 'tmr_lvid=abc; _ym_uid=987',
};

describe('parseTildaForm', () => {
  it('раскладывает форму Тильды по местам', () => {
    const parsed = parseTildaForm(tildaBody);

    expect(parsed.token).toBe('83205beb-3c83-44dc-b256-b1b05be9d03b');
    expect(parsed.documentId).toBe('0ad0d9b2-6f1a-4f0e-9a5a-2b2b6a5f8c11');
    expect(parsed.email).toBe('anna@example.ru');
    expect(parsed.fields).toEqual({
      name: 'Кузьмина-Караваева Анна',
      place: 'Первое место',
    });
  });

  it('не пускает служебные поля Тильды в переменные документа', () => {
    const parsed = parseTildaForm(tildaBody);

    // COOKIES — это чужие куки целой строкой. В грамоте им делать нечего.
    for (const junk of ['tranid', 'formid', 'formservices', 'cookies', 'COOKIES', 'secure', 'doc_id']) {
      expect(parsed.fields).not.toHaveProperty(junk);
    }
    expect(parsed.fields).not.toHaveProperty('email');
    expect(parsed.fields).not.toHaveProperty('consent');
  });

  it('принимает поля и без приставки mask_', () => {
    // Прежняя наша инструкция называла поля просто name и email.
    const parsed = parseTildaForm({ name: 'Иванов Иван', email: 'i@example.ru', consent: 'да' });

    expect(parsed.fields.name).toBe('Иванов Иван');
    expect(parsed.email).toBe('i@example.ru');
  });

  it('отбрасывает имена переменных не латиницей', () => {
    // Переменная документа пишется латиницей — кириллическое имя поля
    // всё равно ни с чем не совпадёт, и в макет попадёт пустота.
    const parsed = parseTildaForm({ mask_имя: 'Анна', 'mask_name ': 'Анна' });

    expect(parsed.fields).toEqual({ name: 'Анна' });
  });

  it('берёт первое значение, если Тильда прислала несколько', () => {
    const parsed = parseTildaForm({ mask_place: ['Первое место', 'Второе место'] });

    expect(parsed.fields.place).toBe('Первое место');
  });

  it('подставляет имя и адрес из личного кабинета, когда своих нет', () => {
    const parsed = parseTildaForm({ ma_name: 'Пётр Смирнов', ma_email: 'p@example.ru' });

    expect(parsed.fields.name).toBe('Пётр Смирнов');
    expect(parsed.email).toBe('p@example.ru');
    expect(parsed.accountEmail).toBe('p@example.ru');
  });

  it('не затирает введённое человеком данными кабинета', () => {
    const parsed = parseTildaForm({
      mask_name: 'Анна К.',
      mask_email: 'other@example.ru',
      ma_name: 'Анна Кузьмина',
      ma_email: 'anna@example.ru',
    });

    expect(parsed.fields.name).toBe('Анна К.');
    // Куда прислать — что вписали; кто это — учётная запись. Это разные вопросы.
    expect(parsed.email).toBe('other@example.ru');
    expect(parsed.accountEmail).toBe('anna@example.ru');
  });

  it('считает согласие данным при любой непустой отметке', () => {
    // Значение флажка в Тильде задаёт владелец сайта, чаще всего это подпись.
    for (const value of ['yes', 'on', 'да', 'Согласен с условиями', '1']) {
      expect(parseTildaForm({ consent: value }).consent).toBe(true);
    }
  });

  it('считает согласие не данным, когда флажка нет или он снят', () => {
    for (const body of [{}, { consent: '' }, { consent: 'no' }, { consent: '0' }, { consent: 'нет' }]) {
      expect(parseTildaForm(body).consent).toBe(false);
    }
  });

  it('пропускает ловушку для автоматов дальше, а не глотает её', () => {
    // Решение по ловушке принимает служба: здесь только разбор.
    expect(parseTildaForm({ website: 'http://spam.example' }).website).toBe('http://spam.example');
    expect(parseTildaForm({}).website).toBeUndefined();
  });

  it('обрезает слишком длинные значения', () => {
    const parsed = parseTildaForm({ mask_name: 'я'.repeat(900) });

    expect(parsed.fields.name).toHaveLength(500);
  });

  it('не падает на мусоре вместо тела', () => {
    for (const body of [{}, { mask_name: null }, { mask_name: {} }, { mask_name: 42 }]) {
      expect(() => parseTildaForm(body as Record<string, unknown>)).not.toThrow();
    }
    expect(parseTildaForm({ mask_name: 42 }).fields.name).toBe('42');
  });
});
