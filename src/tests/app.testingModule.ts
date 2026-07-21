import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import { EventEntity, SubscriberEntity, DeliveryEntity } from "@src/database/entities";
import { EventsModule } from "@src/events/events.module";
import { SubscribersModule } from "@src/subscribers/subscribers.module";
import { DeliveryModule } from "@src/delivery/delivery.module";
import { HealthModule } from "@src/health/health.module";

export const createTestModule = async (): Promise<TestingModule> => {
  process.env.INTERNAL_API_KEY = "test-api-key";
  process.env.DB_TYPE = "postgres";

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      TypeOrmModule.forRoot({
        type: "postgres",
        host: "localhost",
        port: 5432,
        username: "root",
        password: "1234",
        database: "event_server_test",
        entities: [EventEntity, SubscriberEntity, DeliveryEntity],
        synchronize: true,
        dropSchema: true,
        logging: false,
      }),
      DeliveryModule,
      EventsModule,
      SubscribersModule,
      HealthModule,
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
