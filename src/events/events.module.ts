import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InternalAuthGuard } from "api-server-toolkit/guard";
import { EventEntity, SubscriberEntity, DeliveryEntity } from "@src/database/entities";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { DeliveryModule } from "@src/delivery/delivery.module";
import { ContractsController } from "@src/contracts/contracts.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity, SubscriberEntity, DeliveryEntity]),
    DeliveryModule,
  ],
  controllers: [EventsController, ContractsController],
  providers: [EventsService, InternalAuthGuard],
  exports: [EventsService],
})
export class EventsModule {}
