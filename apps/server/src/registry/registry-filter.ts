import { Prisma } from '@prisma/client';
import type { RegistryFilterDto } from './registry.dto';
import { normalizePublicCode } from '../verify/public-code';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Условие выборки реестра.
 *
 * Вынесено отдельной чистой функцией, потому что одно и то же условие
 * применяют четыре места: страница таблицы, счётчик строк, сводка
 * аналитики и сборка архива. Разойдись они хоть в одном пункте — человек
 * скачал бы не то, что видит на экране.
 *
 * orgId стоит первым и не имеет значения по умолчанию: реестр читает
 * выданные документы, и запрос без организации вернул бы чужие.
 */
export function registryWhere(
  orgId: string,
  filter: RegistryFilterDto,
  ids: string[] = [],
): Prisma.FileWhereInput {
  const where: Prisma.FileWhereInput = {
    orgId,
    kind: 'generated',
    deletedAt: null,
    // Записи без байтов остались от прежнего порядка, когда файл заводили
    // до отправки в хранилище. Скачать по ним нечего, и в реестре
    // выданного им не место.
    s3Key: { not: '' },
  };

  if (ids.length > 0) where.id = { in: ids };
  if (filter.documentId) where.documentId = filter.documentId;

  if (filter.from || filter.to) {
    where.createdAt = {
      ...(filter.from ? { gte: dayStart(filter.from) } : {}),
      // Верхнюю границу человек называет днём, а не мгновением: «по 31-е»
      // означает включая всё 31-е число целиком.
      ...(filter.to ? { lt: dayStart(filter.to, 1) } : {}),
    };
  }

  if (filter.event) {
    where.document = { eventName: filter.event };
  }

  if (filter.state === 'revoked') where.verifyRevoked = true;
  if (filter.state === 'replaced') {
    where.verifyRevoked = false;
    where.replacedById = { not: null };
  }
  if (filter.state === 'valid') {
    where.verifyRevoked = false;
    where.replacedById = null;
  }

  if (filter.mail) {
    // По состоянию последнего письма отобрать нельзя — «последнее» знает
    // только выборка, а не условие. Совпадение по любому из писем строки
    // отличается от показанного в таблице лишь у тех, кому переотправляли
    // и у кого прежняя попытка окончилась иначе.
    where.emails =
      filter.mail === 'none' ? { none: {} } : { some: { status: filter.mail, orgId } };
  }

  const search = filter.search?.trim();
  if (search) {
    // Короткий код принимаем так, как его продиктовали: без дефисов,
    // строчными, с O вместо нуля. Ищем целиком, как и UUID.
    const code = normalizePublicCode(search);
    where.OR = [
      { row: { data: { path: ['name'], string_contains: search, mode: 'insensitive' } } },
      { row: { data: { path: ['email'], string_contains: search, mode: 'insensitive' } } },
      // Проверочный код ищем целиком: это идентификатор, и «содержит»
      // для него означало бы перебор чужих кодов по кускам.
      ...(UUID.test(search) ? [{ publicId: search.toLowerCase() }] : []),
      ...(code ? [{ publicCode: code }] : []),
    ];
  }

  return where;
}

/**
 * Московское смещение в минутах.
 *
 * Даты в реестре показываются по Москве (см. выгрузку в CSV), и границы
 * периода обязаны считаться в том же поясе: иначе «с 1 августа» отрезало бы
 * документы, выданные первого числа до трёх часов ночи, а человек видел бы
 * в таблице дату, которая в его же фильтр не попадает. Перехода на летнее
 * время в России нет, поэтому смещение постоянное.
 */
const MOSCOW_OFFSET_MINUTES = 180;

/**
 * Начало календарного дня по Москве — в UTC.
 *
 * Дата приходит из поля «дата» браузера строкой вида 2026-08-31 и разбирается
 * как полночь UTC, поэтому день берём по UTC-полям, а не по локальным:
 * часовой пояс сервера не должен влиять на границы выборки.
 */
function dayStart(date: Date, plusDays = 0): Date {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + plusDays);
  start.setUTCMinutes(start.getUTCMinutes() - MOSCOW_OFFSET_MINUTES);
  return start;
}
