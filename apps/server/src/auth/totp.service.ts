import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { InjectRedis } from '../common/redis.module';
import { totpSecretKey, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from './password';
import {
  BACKUP_CODES_COUNT,
  generateBackupCodes,
  generateTotpSecret,
  normalizeBackupCode,
  otpauthUrl,
  verifyTotp,
} from './totp';
import { decryptTotpSecret, encryptTotpSecret, hashBackupCode } from './totp-crypto';

/** Секрет, который ещё не подтверждён кодом, живёт десять минут и только в Redis. */
const PENDING_TTL_SECONDS = 10 * 60;
const PENDING_PREFIX = 'totp:pending:';
/** Уже использованный шаг: один код нельзя предъявить дважды за его окно. */
const USED_PREFIX = 'totp:used:';
const USED_TTL_SECONDS = 120;

const ISSUER = 'Вручай';

const WRONG_CODE = 'Код не подошёл. Проверьте время на телефоне и попробуйте ещё раз';

/**
 * Второй фактор входа: одноразовые коды из приложения на телефоне.
 *
 * Включается в два шага. Сначала показываем секрет и QR — и держим его
 * только в Redis: человек мог закрыть страницу, не добавив ключ в
 * приложение, и включённая 2FA без ключа заперла бы его снаружи. В базу
 * секрет попадает только вместе с первым сошедшимся кодом, и тогда же
 * выдаются резервные коды — единственный путь внутрь при потере телефона.
 */
@Injectable()
export class TotpService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: IORedis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpEnabledAt: true },
    });
    const backupCodesLeft = user.totpEnabledAt
      ? await this.prisma.totpBackupCode.count({ where: { userId, usedAt: null } })
      : 0;
    return { enabled: user.totpEnabledAt !== null, enabledAt: user.totpEnabledAt, backupCodesLeft };
  }

  /** Шаг первый: новый секрет и ссылка для QR. Ничего в базе не меняется. */
  async setup(userId: string, email: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpEnabledAt: true },
    });
    if (user.totpEnabledAt) {
      throw new BadRequestException('Второй фактор уже включён. Сначала выключите его');
    }
    const secret = generateTotpSecret();
    await this.redis.set(PENDING_PREFIX + userId, secret, 'EX', PENDING_TTL_SECONDS);
    return { secret, otpauth: otpauthUrl({ secret, account: email, issuer: ISSUER }) };
  }

  /** Шаг второй: код из приложения сошёлся — включаем и выдаём резервные коды. */
  async enable(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const secret = await this.redis.get(PENDING_PREFIX + userId);
    if (!secret) {
      throw new BadRequestException(
        'Время на подключение вышло. Начните заново — покажем новый QR-код',
      );
    }
    if (verifyTotp(secret, code, nowSeconds()) === null) {
      throw new BadRequestException(WRONG_CODE);
    }

    const key = this.key();
    const backupCodes = generateBackupCodes();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { totpSecret: encryptTotpSecret(secret, key), totpEnabledAt: new Date() },
      }),
      this.prisma.totpBackupCode.deleteMany({ where: { userId } }),
      this.prisma.totpBackupCode.createMany({
        data: backupCodes.map((c) => ({
          userId,
          codeHash: hashBackupCode(normalizeBackupCode(c), key),
        })),
      }),
    ]);
    await this.redis.del(PENDING_PREFIX + userId);

    return { backupCodes };
  }

  /**
   * Выключение — паролем и действующим кодом: открытая сессия на чужом
   * компьютере не должна снимать защиту, ради которой её включали.
   */
  async disable(userId: string, password: string, code: string): Promise<void> {
    await this.assertPassword(userId, password);
    if (!(await this.check(userId, code))) throw new BadRequestException(WRONG_CODE);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { totpSecret: null, totpEnabledAt: null },
      }),
      this.prisma.totpBackupCode.deleteMany({ where: { userId } }),
    ]);
  }

  /** Новые резервные коды взамен старых: старые перестают действовать сразу. */
  async regenerateBackupCodes(
    userId: string,
    password: string,
  ): Promise<{ backupCodes: string[] }> {
    await this.assertPassword(userId, password);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpEnabledAt: true },
    });
    if (!user.totpEnabledAt) throw new BadRequestException('Второй фактор не включён');

    const key = this.key();
    const backupCodes = generateBackupCodes();
    await this.prisma.$transaction([
      this.prisma.totpBackupCode.deleteMany({ where: { userId } }),
      this.prisma.totpBackupCode.createMany({
        data: backupCodes.map((c) => ({
          userId,
          codeHash: hashBackupCode(normalizeBackupCode(c), key),
        })),
      }),
    ]);
    return { backupCodes };
  }

  /**
   * Сверка при входе: код из приложения либо резервный код.
   *
   * Резервный сгорает при первом использовании; код из приложения нельзя
   * предъявить второй раз в том же окне — иначе подсмотренный через плечо
   * код годился бы ещё минуту.
   */
  async check(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabledAt: true },
    });
    if (!user?.totpSecret || !user.totpEnabledAt) return false;

    const key = this.key();
    const trimmed = code.trim();

    if (/^\d{3}\s?\d{3}$/.test(trimmed)) {
      const secret = decryptTotpSecret(user.totpSecret, key);
      const step = verifyTotp(secret, trimmed, nowSeconds());
      if (step === null) return false;
      const fresh = await this.redis.set(
        `${USED_PREFIX}${userId}:${step}`,
        '1',
        'EX',
        USED_TTL_SECONDS,
        'NX',
      );
      return fresh === 'OK';
    }

    const normalized = normalizeBackupCode(trimmed);
    if (normalized.length !== 10) return false;
    const burned = await this.prisma.totpBackupCode.updateMany({
      where: { userId, codeHash: hashBackupCode(normalized, key), usedAt: null },
      data: { usedAt: new Date() },
    });
    return burned.count === 1;
  }

  static readonly BACKUP_CODES_COUNT = BACKUP_CODES_COUNT;

  private async assertPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new BadRequestException('Пароль указан неверно');
    }
  }

  private key(): string {
    return totpSecretKey({
      TOTP_SECRET_KEY: this.config.get('TOTP_SECRET_KEY', { infer: true }),
      SESSION_SECRET: this.config.get('SESSION_SECRET', { infer: true }),
    });
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
