import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformOnlyGuard } from '../auth/platform-only.guard';
import type { SessionUser } from '../auth/auth.service';
import { uuidSchema } from '../documents/documents.dto';
import { ReviewsService } from './reviews.service';

const uuidParam = new ZodValidationPipe(uuidSchema);

const submitSchema = z.object({
  authorName: z.string().trim().min(2, 'Укажите, как вас зовут').max(120),
  authorRole: z.string().trim().min(2, 'Укажите вашу должность').max(120),
  orgName: z.string().trim().min(2, 'Укажите организацию').max(200),
  // Нижняя граница не придирка: «всё ок» не отзыв, по нему невозможно
  // понять, чем сервис пригодился, и на витрине он ничего не даёт.
  text: z.string().trim().min(40, 'Напишите хотя бы пару предложений').max(2000),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

const moderateSchema = z.object({
  publish: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

const listSchema = z.object({
  status: z.enum(['pending', 'published', 'rejected']).optional(),
});

/** Свой отзыв: посмотреть, оставить, переписать, убрать. */
@Controller('reviews')
@UseGuards(AuthGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('mine')
  mine(@CurrentUser() user: SessionUser) {
    return this.reviews.mine(user.orgId);
  }

  @Patch('mine')
  submit(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(submitSchema)) dto: z.infer<typeof submitSchema>,
  ) {
    return this.reviews.submit(user.orgId, user.userId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: SessionUser, @Param('id', uuidParam) id: string) {
    return this.reviews.remove(user.orgId, id);
  }
}

/**
 * Проверка отзывов перед публикацией. Только организация-площадка:
 * решать, что висит на нашей витрине, — наше дело.
 */
@Controller('reviews/moderation')
@UseGuards(AuthGuard, PlatformOnlyGuard)
export class ReviewsModerationController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.reviews.listForModeration(query.status);
  }

  @Patch(':id')
  moderate(
    @Param('id', uuidParam) id: string,
    @Body(new ZodValidationPipe(moderateSchema)) dto: z.infer<typeof moderateSchema>,
  ) {
    return this.reviews.moderate(id, dto);
  }
}

/**
 * Опубликованные отзывы для посадочной страницы — без входа.
 *
 * Наружу уходит только то, что автор согласился показать. Ни адресов,
 * ни идентификаторов организаций здесь нет.
 */
@Controller('v1/reviews')
export class PublicReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  published(
    @Query(new ZodValidationPipe(z.object({ limit: z.coerce.number().int().min(1).max(50).default(12) })))
    query: { limit: number },
  ) {
    return this.reviews.published(query.limit);
  }
}
