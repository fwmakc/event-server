import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EventEntity, SubscriberEntity, DeliveryEntity } from "@src/database/entities";
import { DeliveryService } from "./delivery.service";
import { DeliveryWorker } from "./delivery.worker";

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity, SubscriberEntity, DeliveryEntity]),
  ],
  providers: [DeliveryService, DeliveryWorker],
  exports: [DeliveryService],
})
export class DeliveryModule {}
