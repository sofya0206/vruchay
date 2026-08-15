import { Global, Module } from '@nestjs/common';
import { ReferralController, ReferralOfferController } from './referral.controller';
import { ReferralService } from './referral.service';

/**
 * Глобальный: бонусные документы нужны и при регистрации (кто пригласил),
 * и при проверке бесплатной пробы (сколько добавить к лимиту).
 */
@Global()
@Module({
  controllers: [ReferralController, ReferralOfferController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
