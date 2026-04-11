import { MigrationInterface, QueryRunner } from "typeorm";

export class SyncDatabaseSchema1776100000000 implements MigrationInterface {
    name = 'SyncDatabaseSchema1776100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add missing columns to disputes table
        await queryRunner.query(`ALTER TABLE \`disputes\` ADD \`description\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`disputes\` ADD \`raisedBy\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`disputes\` ADD \`evidenceUrls\` text NULL`);

        // Create broadcasts table
        await queryRunner.query(`
            CREATE TABLE \`broadcasts\` (
                \`id\` varchar(36) NOT NULL,
                \`type\` enum ('push', 'email') NOT NULL,
                \`targets\` varchar(255) NOT NULL,
                \`title\` varchar(255) NULL,
                \`content\` text NOT NULL,
                \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE = InnoDB
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE \`broadcasts\``);
        await queryRunner.query(`ALTER TABLE \`disputes\` DROP COLUMN \`evidenceUrls\``);
        await queryRunner.query(`ALTER TABLE \`disputes\` DROP COLUMN \`raisedBy\``);
        await queryRunner.query(`ALTER TABLE \`disputes\` DROP COLUMN \`description\``);
    }

}
