import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformOnlyGuard } from '../auth/platform-only.guard';
import { uuidSchema } from '../documents/documents.dto';
import { AuditActor } from '../audit/actor.decorator';
import { AuditService, type Actor } from '../audit/audit.service';
import { PlatformService } from './platform.service';

const uuidParam = new ZodValidationPipe(uuidSchema);
const planSchema = z.object({ plan: z.enum(['free', 'paid']) });

/**
 * Организации-клиенты глазами владельца сервиса.
 *
 * Единственное действие — перевести с бесплатной пробы на оплаченный
 * тариф и обратно. До этого оно делалось правкой в базе: команда,
 * которую страшно выполнять в три часа ночи после поступления денег,
 * и о которой негде прочитать, кто и когда её выполнял.
 *
 * Никаких данных внутри организаций отсюда не видно — только название,
 * тариф и сколько выпущено. Читать чужие списки участников владелец
 * сервиса не должен, и техническая возможность для этого не заводится.
 */
@Controller('platform/organizations')
@UseGuards(AuthGuard, PlatformOnlyGuard)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.platform.listOrganizations();
  }

  @Patch(':id/plan')
  async setPlan(
    @AuditActor() actor: Actor,
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(planSchema)) dto: z.infer<typeof planSchema>,
  ) {
    const result = await this.platform.setPlan(id, dto.plan);

    // Пишем в журнал нашей организации, а не клиентской: это наше
    // действие, и отвечать за него нам.
    await this.audit.record({
      actor,
      action: 'platform.plan',
      summary:
        dto.plan === 'paid'
          ? `Организация «${result.name}» переведена на оплаченный тариф`
          : `Организация «${result.name}» возвращена на бесплатную пробу`,
      targetType: 'organization',
      targetId: id,
      meta: { plan: dto.plan },
    });

    return result;
  }
}
