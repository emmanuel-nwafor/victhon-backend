import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPushToken1774451759611 implements MigrationInterface {
    name = 'AddPushToken1774451759611'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`pushToken\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`professionals\` ADD \`pushToken\` varchar(255) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`professionals\` DROP COLUMN \`pushToken\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`pushToken\``);
    }
}
