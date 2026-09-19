import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { validateEnv } from './config/env';
import { StorageModule } from './storage/storage.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/redis.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { FoldersModule } from './folders/folders.module';
import { RecipientsModule } from './recipients/recipients.module';
import { AwardsModule } from './awards/awards.module';
import { RenderModule } from './render/render.module';
import { GenerationModule } from './generation/generation.module';
import { ValidationModule } from './validation/validation.module';
import { MailModule } from './mail/mail.module';
import { MailingModule } from './mailing/mailing.module';
import { TildaModule } from './tilda/tilda.module';
import { VerifyModule } from './verify/verify.module';
import { RegistryModule } from './registry/registry.module';
import { LeadsModule } from './leads/leads.module';
import { PaymentsModule } from './payments/payments.module';
import { InvoicesModule } from './invoices/invoices.module';
import { TeamModule } from './team/team.module';
import { AuditModule } from './audit/audit.module';
import { ReferralModule } from './referral/referral.module';
import { PushModule } from './push/push.module';
import { RecipientModule } from './recipient/recipient.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SupportModule } from './support/support.module';
import { OrgModule } from './org/org.module';
import { OverviewModule } from './overview/overview.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { TokensModule } from './tokens/tokens.module';
import { BackupModule } from './backup/backup.module';
import { PlatformModule } from './platform/platform.module';
import { ExpiryModule } from './expiry/expiry.module';
import { PublicOrgModule } from './public-org/public-org.module';
import { PlansModule } from './plans/plans.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    RedisModule,
    CommonModule,
    StorageModule,
    AuthModule,
    DocumentsModule,
    FoldersModule,
    RecipientsModule,
    AwardsModule,
    RenderModule,
    GenerationModule,
    ValidationModule,
    MailModule,
    MailingModule,
    TildaModule,
    VerifyModule,
    RegistryModule,
    LeadsModule,
    PaymentsModule,
    InvoicesModule,
    TeamModule,
    AuditModule,
    ReferralModule,
    PushModule,
    RecipientModule,
    ReviewsModule,
    SupportModule,
    OrgModule,
    OverviewModule,
    AnalyticsModule,
    TokensModule,
    BackupModule,
    PlatformModule,
    ExpiryModule,
    PublicOrgModule,
    PlansModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
