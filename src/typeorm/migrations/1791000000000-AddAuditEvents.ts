import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuditEvents1791000000000 implements MigrationInterface {
    name = 'AddAuditEvents1791000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_events" (
            "id" SERIAL NOT NULL,
            "action" varchar NOT NULL,
            "outcome" varchar NOT NULL DEFAULT 'success',
            "account_id" BIGINT,
            "account_username" varchar,
            "tenant_id" BIGINT,
            "ip" varchar,
            "user_agent" varchar,
            "request_id" varchar,
            "target_type" varchar,
            "target_id" varchar,
            "details" jsonb,
            "prev_hash" char(64) NOT NULL,
            "hash" char(64) NOT NULL,
            "created_at" timestamptz NOT NULL,
            CONSTRAINT "PK_audit_events_id" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(`CREATE INDEX "idx_audit_events_action" ON "audit_events" ("action")`);
        await queryRunner.query(`CREATE INDEX "idx_audit_events_account" ON "audit_events" ("account_id")`);
        await queryRunner.query(`CREATE INDEX "idx_audit_events_created" ON "audit_events" ("created_at")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_audit_events_hash" ON "audit_events" ("hash")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_audit_events_hash"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_audit_events_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_audit_events_account"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_audit_events_action"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
    }
}
