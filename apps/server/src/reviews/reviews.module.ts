import { Module } from '@nestjs/common';
import {
  PublicReviewsController,
  ReviewsController,
  ReviewsModerationController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ReviewsController, ReviewsModerationController, PublicReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
