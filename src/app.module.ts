import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { DatabaseModule } from "@src/database/database.module";
import { EventsModule } from "@src/events/events.module";
import { SubscribersModule } from "@src/subscribers/subscribers.module";
import { DeliveryModule } from "@src/delivery/delivery.module";
import { HealthModule } from "api-server-toolkit/health";

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    DeliveryModule,
    EventsModule,
    SubscribersModule,
    HealthModule.forRoot("event-server"),
  ],
  providers: [
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
