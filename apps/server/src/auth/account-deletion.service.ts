import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from './password';

/**
 * Удаление собственной учётной записи.
 *
 * Право человека забрать свои данные (ст. 14 152-ФЗ) упирается здесь
 * в чужое право: выданные документы принадлежат не сотруднику, а
 * организации, и лежат на руках у награждённых с QR-кодом на бумаге.
 * Поэтому удаляется человек, а не следы его работы.
 *
 * Что уходит вместе с учётной записью: адрес, имя, пароль, второй фактор
 * с резервными кодами, сессии, журнал входов, отзывы. Это личные данные
 * человека, и держать их после его ухода незачем.
 *
 * Что остаётся: записи журнала действий организации — там имя и адрес
 * лежат копией на момент события намеренно (см. модель AuditEvent),
 * иначе журнал перестал бы отвечать на вопрос «кто это сделал», ради
 * которого заведён. И сами выданные документы: их проверяют посторонние
 * люди, и молча погасить их проверку значило бы обмануть тех,
 * кто держит бумагу.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Что мешает удалить учётную запись прямо сейчас. Пустой список — ничто.
   *
   * Показывается до нажатия кнопки: человек должен увидеть препятствия
   * заранее, а не после ввода пароля.
   */
  async blockers(userId: string): Promise<string[]> {
    const memberships = await this.prisma.orgMember.findMany({
      where: { userId },
      select: {
        role: true,
        orgId: true,
        org: {
          select: {
            name: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    const blockers: string[] = [];
    for (const membership of memberships) {
      if (membership.role !== 'owner') continue;

      if (membership.org._count.members > 1) {
        blockers.push(
          `Вы владелец организации «${membership.org.name}», и в ней есть другие сотрудники. ` +
            `Передайте организацию другому владельцу — иначе она останется без хозяина.`,
        );
        continue;
      }

      const issued = await this.prisma.file.count({
        where: { orgId: membership.orgId, kind: 'generated', deletedAt: null },
      });
      if (issued > 0) {
        blockers.push(
          `В организации «${membership.org.name}» выдано документов: ${issued}. ` +
            `Их проверяют по QR-коду посторонние люди, поэтому вместе с учётной записью ` +
            `они не удаляются. Сначала удалите материалы через корзину — там это отдельное ` +
            `осознанное действие с предупреждением.`,
        );
      }
    }
    return blockers;
  }

  /**
   * Удаление после подтверждения паролем.
   *
   * Пароль спрашиваем даже у вошедшего: удаление необратимо, а открытая
   * чужая вкладка — самый обычный способ потерять учётную запись.
   *
   * Организации, где человек был единственным участником и где ничего
   * не выдано, уходят вместе с ним: пустая организация без хозяина —
   * это мусор, который никто уже не откроет.
   */
  async delete(userId: string, password: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });
    if (!user) throw new BadRequestException('Учётная запись не найдена');

    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new BadRequestException('Пароль указан неверно');
    }

    // Препятствия перепроверяем прямо перед удалением, а не только
    // на экране: между показом и нажатием могли принять сотрудника
    // или выпустить документы.
    const blockers = await this.blockers(userId);
    if (blockers.length > 0) throw new BadRequestException(blockers[0]);

    const soleOwned = await this.prisma.orgMember.findMany({
      where: { userId, role: 'owner', org: { members: { every: { userId } } } },
      select: { orgId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      for (const { orgId } of soleOwned) {
        await tx.organization.delete({ where: { id: orgId } });
      }
      await tx.user.delete({ where: { id: userId } });
    });

    // Адрес в журнал сервера не пишем: человек как раз попросил
    // перестать хранить о нём сведения.
    this.logger.log(`Учётная запись удалена по просьбе владельца, организаций удалено: ${soleOwned.length}`);
    return { ok: true as const };
  }
}
