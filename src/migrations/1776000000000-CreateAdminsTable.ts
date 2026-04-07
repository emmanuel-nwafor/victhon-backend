import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAdminsTable1776000000000 implements MigrationInterface {
    name = 'CreateAdminsTable1776000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE \`admins\` (
                \`id\` varchar(36) NOT NULL,
                \`email\` varchar(100) NOT NULL,
                \`password\` text NOT NULL,
                \`firstName\` varchar(50) NULL,
                \`lastName\` varchar(50) NULL,
                \`permissions\` json NULL,
                \`role\` varchar(50) NOT NULL DEFAULT 'admin',
                \`isActive\` tinyint NOT NULL DEFAULT 1,
                \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                UNIQUE INDEX \`IDX_ADMIN_EMAIL\` (\`email\`),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE \`admins\``);
    }
}
