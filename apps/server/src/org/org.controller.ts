import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import type { SessionUser } from '../auth/auth.service';
import { OrgService } from './org.service';
import { updatePublicProfileSchema, type UpdatePublicProfileDto } from './public-profile.dto';

const orgNameSchema = z.object({
  name: z.string().trim().min(2, 'Название не может быть короче двух букв').max(200),
});

const userNameSchema = z.object({
  name: z.string().trim().max(200),
});

@Controller('org')
@UseGuards(AuthGuard, RolesGuard)
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get()
  profile(@CurrentUser() user: SessionUser) {
    return this.org.profile(user.orgId, user.userId);
  }

  /** Остаток бесплатной пробы — показывается в кабинете постоянно. */
  @Get('usage')
  usage(@CurrentUser() user: SessionUser) {
    return this.org.usage(user.orgId);
  }

  /**
   * Название организации меняют владелец и управляющий: оно стоит
   * в имени отправителя писем участникам и на витрине отзывов,
   * то есть говорит от лица всей организации, а не одного сотрудника.
   */
  @Patch()
  @Roles('owner', 'admin')
  rename(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(orgNameSchema)) dto: z.infer<typeof orgNameSchema>,
  ) {
    return this.org.renameOrg(user.orgId, dto.name);
  }

  /**
   * Публичное лицо организации: страница снаружи и то, что о ней говорит
   * страница проверки. Читать могут все сотрудники — им надо знать, что
   * видят проверяющие; менять — владелец и управляющий: это решение
   * о том, сколько организация показывает о себе и об участниках.
   */
  @Get('public-profile')
  publicProfile(@CurrentUser() user: SessionUser) {
    return this.org.publicProfile(user.orgId);
  }

  @Patch('public-profile')
  @Roles('owner', 'admin')
  updatePublicProfile(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(updatePublicProfileSchema)) dto: UpdatePublicProfileDto,
  ) {
    return this.org.updatePublicProfile(user.orgId, dto);
  }

  /** Своё имя правит кто угодно: это его имя. */
  @Patch('me')
  renameMe(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(userNameSchema)) dto: z.infer<typeof userNameSchema>,
  ) {
    return this.org.renameUser(user.userId, dto.name);
  }
}
