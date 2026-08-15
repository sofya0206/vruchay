import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { TeamController, TeamInviteController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [MailModule],
  controllers: [TeamController, TeamInviteController],
  providers: [TeamService],
})
export class TeamModule {}
