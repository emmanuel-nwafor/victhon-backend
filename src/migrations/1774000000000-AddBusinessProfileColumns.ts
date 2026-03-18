import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBusinessProfileColumns1774000000000 implements MigrationInterface {
    name = 'AddBusinessProfileColumns1774000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add Business Columns
        await queryRunner.query(`ALTER TABLE \`professionals\` ADD \`businessName\` varchar(100) NULL`);
        await queryRunner.query(`ALTER TABLE \`professionals\` ADD \`businessCategory\` varchar(100) NULL`);
        await queryRunner.query(`ALTER TABLE \`professionals\` ADD \`businessType\` varchar(100) NULL`);
        await queryRunner.query(`ALTER TABLE \`professionals\` ADD \`ninNumber\` varchar(11) NULL`);
        await queryRunner.query(`ALTER TABLE \`professionals\` ADD \`ninSlipUrl\` varchar(255) NULL`);

        // FIX: Add the missing pushToken columns that are causing the Render crash
        await queryRunner.query(`ALTER TABLE \`professionals\` ADD \`pushToken\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`pushToken\` varchar(255) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`pushToken\``);
        await queryRunner.query(`ALTER TABLE \`professionals\` DROP COLUMN \`pushToken\``);
        await queryRunner.query(`ALTER TABLE \`professionals\` DROP COLUMN \`ninSlipUrl\``);
        await queryRunner.query(`ALTER TABLE \`professionals\` DROP COLUMN \`ninNumber\``);
        await queryRunner.query(`ALTER TABLE \`professionals\` DROP COLUMN \`businessType\``);
        await queryRunner.query(`ALTER TABLE \`professionals\` DROP COLUMN \`businessCategory\``);
        await queryRunner.query(`ALTER TABLE \`professionals\` DROP COLUMN \`businessName\``);
    }
}