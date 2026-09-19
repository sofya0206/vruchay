import { describe, expect, it } from 'vitest';
import { fullHost, txtMatches } from './dns-check';

/*
 * Сравнение записей DNS по смыслу.
 *
 * У домена с почтой SPF уже есть, а вторую запись стандарт не разрешает:
 * наш include дописывают в существующую. Посимвольное сравнение не
 * подтвердило бы такой домен никогда — а это почти любой домен организации.
 */

describe('SPF', () => {
  const ours = 'v=spf1 include:_spf.dashasender.ru ~all';

  it('наш include, дописанный в чужую запись, подходит', () => {
    expect(
      txtMatches('v=spf1 redirect=_spf.yandex.net include:_spf.dashasender.ru ~all', ours),
    ).toBe(true);
    expect(txtMatches('v=spf1 include:_spf.mail.ru include:_spf.dashasender.ru -all', ours)).toBe(
      true,
    );
  });

  it('запись без нашего include — нет', () => {
    expect(txtMatches('v=spf1 include:_spf.yandex.net ~all', ours)).toBe(false);
  });

  it('не SPF — нет, даже если include в тексте есть', () => {
    expect(txtMatches('include:_spf.dashasender.ru', ours)).toBe(false);
  });

  it('регистр и кавычки не важны', () => {
    expect(txtMatches('"V=SPF1 INCLUDE:_spf.dashasender.ru ~all"', ours)).toBe(true);
  });
});

describe('DMARC', () => {
  it('любая политика владельца подходит — строгость выбирает он, а не мы', () => {
    const ours = 'v=DMARC1; p=none; rua=mailto:postmaster@example.ru';
    expect(txtMatches('v=DMARC1; p=reject', ours)).toBe(true);
    expect(txtMatches('v=spf1 ~all', ours)).toBe(false);
  });
});

describe('DKIM', () => {
  it('пробелы после точки с запятой не считаются', () => {
    expect(txtMatches('v=DKIM1; p=MIIBIjANBgkq; t=s', 'v=DKIM1;p=MIIBIjANBgkq;t=s')).toBe(true);
  });

  it('другой ключ — нет', () => {
    expect(txtMatches('v=DKIM1;p=AAAA;t=s', 'v=DKIM1;p=MIIBIjANBgkq;t=s')).toBe(false);
  });
});

describe('прочие записи', () => {
  it('сравниваются целиком', () => {
    expect(txtMatches('vruchay-verify=abc', 'vruchay-verify=abc')).toBe(true);
    expect(txtMatches('vruchay-verify=abd', 'vruchay-verify=abc')).toBe(false);
  });
});

describe('полное имя записи', () => {
  it('короткое и полное имя дают одно и то же', () => {
    expect(fullHost('dm2._domainkey', 'example.ru')).toBe('dm2._domainkey.example.ru');
    expect(fullHost('dm2._domainkey.example.ru.', 'example.ru')).toBe('dm2._domainkey.example.ru');
    expect(fullHost('@', 'example.ru')).toBe('example.ru');
  });
});
