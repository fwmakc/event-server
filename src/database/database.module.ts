import { join } from "path";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DataSource, DataSourceOptions } from "typeorm";
import { runMigrationsUnderLock } from "api-server-toolkit/db";
import { EventEntity, SubscriberEntity, DeliveryEntity, AuditEventEntity } from "./entities";

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
        entities: [EventEntity, SubscriberEntity, DeliveryEntity, AuditEventEntity],
        // Schema is owned by migrations only (src/typeorm/migrations) — pending
        // migrations are applied on every boot; never enable synchronize.
        migrationsRun: true,
        logging: config.get<string>("DB_LOG", "false") === "true",
        extra: {
          max: Number(config.get<string>("DB_POOL_MAX", "50")),
        },
        migrations: [join(__dirname, "../typeorm/migrations/*{.ts,.js}")],
        migrationsTableName: "migrations_typeorm",
      }),
      // Serialize boot migrations across replicas (TypeORM has no built-in
      // migration locking); the helper consumes `migrationsRun`.
      async dataSourceFactory(option) {
        if (!option) throw new Error("Invalid options passed");
        const { migrationsRun, ...dsOption } = option;
        if (migrationsRun) {
          await runMigrationsUnderLock(dsOption as DataSourceOptions);
        }
        return new DataSource(dsOption as DataSourceOptions);
      },
    }),
    TypeOrmModule.forFeature([EventEntity, SubscriberEntity, DeliveryEntity, AuditEventEntity]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
