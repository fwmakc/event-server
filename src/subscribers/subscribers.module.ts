import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InternalAuthGuard } from "api-server-toolkit/guard";
import { SubscriberEntity } from "@src/database/entities";
import { SubscribersController } from "./subscribers.controller";
import { SubscribersService } from "./subscribers.service";

@Module({
  imports: [TypeOrmModule.forFeature([SubscriberEntity])],
  controllers: [SubscribersController],
  providers: [SubscribersService, InternalAuthGuard],
  exports: [SubscribersService],
})
export class SubscribersModule {}
