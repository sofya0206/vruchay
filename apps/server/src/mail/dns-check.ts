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

/**
 * Подходит ли найденная TXT-запись под ожидаемую.
 *
 * SPF и DMARC сравниваются по смыслу, а не посимвольно. У домена, где уже
 * есть почта, запись SPF есть тоже, а вторую заводить нельзя — стандарт
 * разрешает ровно одну, и наш include дописывают в существующую. Строгое
 * сравнение не подтвердило бы такой домен никогда. Для SPF поэтому нужно,
 * чтобы в записи были все наши include, для DMARC — чтобы политика была
 * вообще: её строгость выбирает владелец домена, а не мы.
 *
 * DKIM — длинный ключ, и регистраторы по-разному обходятся с пробелами
 * после точки с запятой; их не считаем.
 */
export function txtMatches(actual: string, expected: string): boolean {
  const a = normalize(actual);
  const e = normalize(expected);

  if (e.startsWith('v=spf1')) {
    if (!a.startsWith('v=spf1')) return false;
    const present = new Set(a.split(' '));
    return e
      .split(' ')
      .filter((term) => term.startsWith('include:'))
      .every((term) => present.has(term));
  }
  if (e.startsWith('v=dmarc1')) return a.startsWith('v=dmarc1');
  if (e.startsWith('v=dkim1')) return a.replace(/\s+/g, '') === e.replace(/\s+/g, '');
  return a === e;
}

async function hasTxt(host: string, expected: string): Promise<boolean> {
  try {
    // TXT-запись может быть разбита на несколько строк — их надо склеить.
    const values = (await dns.resolveTxt(host)).map((parts) => parts.join(''));

    // Две записи SPF — это не «на всякий случай», а ошибка: почтовые
    // службы считают такой домен ненастроенным и проверку не проходят.
    if (normalize(expected).startsWith('v=spf1')) {
      const spf = values.filter((v) => normalize(v).startsWith('v=spf1'));
      return spf.length === 1 && txtMatches(spf[0], expected);
    }
    return values.some((v) => txtMatches(v, expected));
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

/**
 * Уникальная запись — единственное доказательство владения доменом.
 * Записи SPF, DKIM и DMARC у провайдера одинаковы для всех клиентов
 * или выдаются по одному имени домена, и подтверждением быть не могут.
 */
export function ownershipRecord(verificationToken: string): DnsRecord {
  return {
    type: 'TXT',
    host: '_vruchay-verify',
    value: `vruchay-verify=${verificationToken}`,
    purpose: 'Подтверждение владения доменом. Уникальна для вашей организации',
  };
}

export function dmarcRecord(domain: string): DnsRecord {
  return {
    type: 'TXT',
    host: '_dmarc',
    value: 'v=DMARC1; p=none; rua=mailto:postmaster@' + domain,
    purpose: 'DMARC: политика для писем, не прошедших проверку. Начинаем с p=none',
  };
}
