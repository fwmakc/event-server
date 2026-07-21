import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EventEntity, SubscriberEntity, DeliveryEntity } from "@src/database/entities";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { DeliveryModule } from "@src/delivery/delivery.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity, SubscriberEntity, DeliveryEntity]),
    DeliveryModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
