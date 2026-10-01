import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSubscriberSecret1792000000000 implements MigrationInterface {
    name = 'AddSubscriberSecret1792000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Nullable: legacy subscribers keep working via the shared internal
        // key until a secret is provisioned (registration passes `secret` or
        // POST /subscribe/:id/rotate generates one).
        await queryRunner.query(`ALTER TABLE "subscribers" ADD "secret" varchar`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscribers" DROP COLUMN "secret"`);
    }
}
