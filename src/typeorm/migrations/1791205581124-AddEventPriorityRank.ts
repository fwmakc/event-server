import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEventPriorityRank1791205581124 implements MigrationInterface {
    name = 'AddEventPriorityRank1791205581124'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" ADD "priority_rank" smallint GENERATED ALWAYS AS (CASE "priority" WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END) STORED NOT NULL`);
        await queryRunner.query(`INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES (current_database(), $1, $2, $3, $4, $5)`, ["public","events","GENERATED_COLUMN","priority_rank","CASE \"priority\" WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END"]);
        await queryRunner.query(`CREATE INDEX "idx_events_claim" ON "events" ("status", "priority_rank", "created_at") WHERE "status" = 'pending'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_events_claim"`);
        await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = current_database()`, ["GENERATED_COLUMN","priority_rank"]);
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "priority_rank"`);
    }

}
