import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { z } from 'zod';
import { onboardingEvents } from '@gramota/shared';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PlatformOnlyGuard } from '../auth/platform-only.guard';
import { ThrottleGuard } from '../common/throttle.guard';
import { Throttle } from '../common/throttle.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OnboardingService } from './onboarding.service';

/** Счётчики обучения. Кто именно нажал — не принимается и не хранится. */
@Controller('onboarding')
@UseGuards(AuthGuard, RolesGuard, ThrottleGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** Кабинет шлёт и не ждёт: обучение не должно зависеть от статистики. */
  @Post('events')
  @HttpCode(204)
  @Throttle({ max: 120, timeWindow: '1 minute' })
  async events(
    @Body(new ZodValidationPipe(onboardingEvents)) dto: z.infer<typeof onboardingEvents>,
  ): Promise<void> {
    await this.onboarding.record(dto.events);
  }

  @Get('drop-off')
  @UseGuards(PlatformOnlyGuard)
  dropOff() {
    return this.onboarding.dropOff();
  }
}
