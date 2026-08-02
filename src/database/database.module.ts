import { join } from "path";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEntity, SubscriberEntity, DeliveryEntity } from "./entities";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres" as const,
        host: config.get<string>("DB_HOST", "localhost"),
        port: Number(config.get("DB_PORT", 5432)),
        username: config.get<string>("DB_USER", "root"),
        password: config.get<string>("DB_PASSWORD"),
        database: config.get<string>("DB_NAME", "event_server"),
        entities: [EventEntity, SubscriberEntity, DeliveryEntity],
        synchronize: config.get<string>("DB_SYNCHRONIZE", "false") === "true",
        logging: config.get<string>("DB_LOG", "false") === "true",
        migrations: [join(__dirname, "../typeorm/migrations/*{.ts,.js}")],
        migrationsTableName: "migrations_typeorm",
        migrationsRun: config.get<string>("DB_MIGRATIONS_RUN", "false") === "true",
      }),
    }),
    TypeOrmModule.forFeature([EventEntity, SubscriberEntity, DeliveryEntity]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
