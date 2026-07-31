import { promises as dns } from 'node:dns';
import type { DnsRecord, DomainStatus } from './mail-provider.interface';

/**
 * Проверка DNS-записей домена отправителя.
 *
 * Записи прописывает владелец домена у своего регистратора, и по опыту
 * это самое частое место, где всё ломается: запись добавляют с лишней точкой,
 * дублируют имя домена в поле host или просто ждут меньше, чем живёт кэш.
 * Поэтому сравниваем мягко — с нормализацией — и не считаем отсутствие записи
 * ошибкой сразу: DNS обновляется до 48 часов.
 */

/** Убирает завершающие точки, кавычки и лишние пробелы. */
function normalize(value: string): string {
  return value.trim().replace(/^"|"$/g, '').replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase();
}

/**
 * Полное имя записи. Владельцы доменов путаются: у одних регистраторов
 * в поле host пишут короткое имя, у других — полное с доменом.
 */
export function fullHost(host: string, domain: string): string {
  const h = host.trim().replace(/\.$/, '');
  // «@» у регистраторов означает корень зоны, а не поддомен с таким именем.
  // Без этой ветки получалось «@.example.com», и запись не находилась никогда.
  if (h === '@' || h === '') return domain;
  return h.endsWith(domain) ? h : `${h}.${domain}`;
}

async function hasTxt(host: string, expected: string): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(host);
    // TXT-запись может быть разбита на несколько строк — их надо склеить.
    return records.some((parts) => normalize(parts.join('')) === normalize(expected));
  } catch {
    return false;
  }
}

async function hasCname(host: string, expected: string): Promise<boolean> {
  try {
    const records = await dns.resolveCname(host);
    return records.some((value) => normalize(value) === normalize(expected));
  } catch {
    return false;
  }
}

export async function checkRecords(domain: string, records: DnsRecord[]): Promise<DomainStatus> {
  if (records.length === 0) return 'pending';

  const results = await Promise.all(
    records.map((record) => {
      const host = fullHost(record.host, domain);
      if (record.type === 'CNAME') return hasCname(host, record.value);
      return hasTxt(host, record.value);
    }),
  );

  return results.every(Boolean) ? 'verified' : 'pending';
}
