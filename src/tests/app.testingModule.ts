import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import { EventEntity, SubscriberEntity, DeliveryEntity, AuditEventEntity } from "@src/database/entities";
import { EventsModule } from "@src/events/events.module";
import { SubscribersModule } from "@src/subscribers/subscribers.module";
import { DeliveryModule } from "@src/delivery/delivery.module";
import { AuditModule } from "@src/audit/audit.module";
import { HealthModule } from "api-server-toolkit/health";

export const createTestModule = async (): Promise<TestingModule> => {
  process.env.INTERNAL_API_KEY = "test-api-key";
  process.env.DB_TYPE = "postgres";

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      TypeOrmModule.forRoot({
        type: "postgres",
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 5432,
        username: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "1234",
        database: process.env.DB_NAME || "event_server_test",
        entities: [EventEntity, SubscriberEntity, DeliveryEntity, AuditEventEntity],
        synchronize: true,
        dropSchema: true,
        logging: false,
      }),
      DeliveryModule,
      EventsModule,
      SubscribersModule,
      AuditModule,
      HealthModule.forRoot("event-server"),
    ],
  }).compile();

  return moduleRef;
};

export const createTestApp = async () => {
  const moduleRef = await createTestModule();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  await app.init();
  return { app, moduleRef };
};
