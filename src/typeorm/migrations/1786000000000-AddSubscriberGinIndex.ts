import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSubscriberGinIndex1786000000000 implements MigrationInterface {
    name = 'AddSubscriberGinIndex1786000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "failure_streak" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_subscribers_patterns" ON "subscribers" USING GIN ("patterns")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_subscribers_patterns"`);
        await queryRunner.query(`ALTER TABLE "subscribers" DROP COLUMN IF EXISTS "failure_streak"`);
    }
}
