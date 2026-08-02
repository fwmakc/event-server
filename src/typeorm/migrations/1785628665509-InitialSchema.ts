import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1785628665509 implements MigrationInterface {
    name = 'InitialSchema1785628665509'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "subscribers" ("id" SERIAL NOT NULL, "service" character varying NOT NULL, "url" character varying NOT NULL, "patterns" text array NOT NULL DEFAULT '{}', "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cbe0a7a9256c826f403c0236b67" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_subscribers_active" ON "subscribers" ("active") `);
        await queryRunner.query(`CREATE TABLE "deliveries" ("id" SERIAL NOT NULL, "event_id" integer NOT NULL, "subscriber_id" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "attempts" integer NOT NULL DEFAULT '0', "max_attempts" integer NOT NULL DEFAULT '5', "last_attempt_at" TIMESTAMP WITH TIME ZONE, "next_attempt_at" TIMESTAMP WITH TIME ZONE, "response_code" integer, "response_body" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a6ef225c5c5f0974e503bfb731f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_deliveries_subscriber" ON "deliveries" ("subscriber_id") `);
        await queryRunner.query(`CREATE INDEX "idx_deliveries_event" ON "deliveries" ("event_id") `);
        await queryRunner.query(`CREATE INDEX "idx_deliveries_status_next" ON "deliveries" ("status", "next_attempt_at") `);
        await queryRunner.query(`CREATE TABLE "events" ("id" SERIAL NOT NULL, "pattern" character varying NOT NULL, "payload" jsonb NOT NULL, "source" character varying NOT NULL, "broadcast" boolean NOT NULL DEFAULT true, "await_response" boolean NOT NULL DEFAULT false, "timeout" integer NOT NULL DEFAULT '30', "max_attempts" integer NOT NULL DEFAULT '5', "retry_delay" integer NOT NULL DEFAULT '1', "log" boolean NOT NULL DEFAULT true, "ttl" integer DEFAULT '7', "priority" character varying NOT NULL DEFAULT 'normal', "delay" integer NOT NULL DEFAULT '0', "status" character varying NOT NULL DEFAULT 'pending', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE, "deliver_after" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_events_expires" ON "events" ("expires_at") `);
        await queryRunner.query(`CREATE INDEX "idx_events_pattern" ON "events" ("pattern") `);
        await queryRunner.query(`CREATE INDEX "idx_events_status_deliver" ON "events" ("status", "deliver_after") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_events_status_deliver"`);
        await queryRunner.query(`DROP INDEX "public"."idx_events_pattern"`);
        await queryRunner.query(`DROP INDEX "public"."idx_events_expires"`);
        await queryRunner.query(`DROP TABLE "events"`);
        await queryRunner.query(`DROP INDEX "public"."idx_deliveries_status_next"`);
        await queryRunner.query(`DROP INDEX "public"."idx_deliveries_event"`);
        await queryRunner.query(`DROP INDEX "public"."idx_deliveries_subscriber"`);
        await queryRunner.query(`DROP TABLE "deliveries"`);
        await queryRunner.query(`DROP INDEX "public"."idx_subscribers_active"`);
        await queryRunner.query(`DROP TABLE "subscribers"`);
    }

}
