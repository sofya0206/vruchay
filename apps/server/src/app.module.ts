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
import { RecipientsModule } from './recipients/recipients.module';
import { RenderModule } from './render/render.module';
import { GenerationModule } from './generation/generation.module';
import { MailModule } from './mail/mail.module';
import { TildaModule } from './tilda/tilda.module';
import { LeadsModule } from './leads/leads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    RedisModule,
    CommonModule,
    StorageModule,
    AuthModule,
    DocumentsModule,
    RecipientsModule,
    RenderModule,
    GenerationModule,
    MailModule,
    TildaModule,
    LeadsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
