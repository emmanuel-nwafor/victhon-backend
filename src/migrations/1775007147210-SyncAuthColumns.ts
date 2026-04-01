import { MigrationInterface, QueryRunner } from "typeorm";

export class SyncAuthColumns1775007147210 implements MigrationInterface {
    name = 'SyncAuthColumns1775007147210'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`professionals\` ADD \`pin\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`bookings\` CHANGE \`status\` \`status\` enum ('pending', 'accepted', 'completed', 'cancelled', 'rejected', 'review', 'disputed', 'on_the_way') NOT NULL DEFAULT 'pending'`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`password\` \`password\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`professionals\` CHANGE \`password\` \`password\` text NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`professionals\` CHANGE \`password\` \`password\` text NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`password\` \`password\` text NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`bookings\` CHANGE \`status\` \`status\` enum ('pending', 'accepted', 'completed', 'cancelled', 'rejected', 'review', 'disputed') NOT NULL DEFAULT 'pending'`);
        await queryRunner.query(`ALTER TABLE \`professionals\` DROP COLUMN \`pin\``);
    }

}
