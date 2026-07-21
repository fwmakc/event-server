import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "@src/database/database.module";
import { EventsModule } from "@src/events/events.module";
import { SubscribersModule } from "@src/subscribers/subscribers.module";
import { DeliveryModule } from "@src/delivery/delivery.module";
import { HealthModule } from "@src/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    DeliveryModule,
    EventsModule,
    SubscribersModule,
    HealthModule,
  ],
})
export class AppModule {}
