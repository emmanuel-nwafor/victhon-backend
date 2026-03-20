import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBusinessLogoToProfessional1774048765550 implements MigrationInterface {
    name = 'AddBusinessLogoToProfessional1774048765550'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("professionals");
        const column = table?.findColumnByName("businessLogo");
        if (!column) {
            await queryRunner.query(`ALTER TABLE \`professionals\` ADD \`businessLogo\` json NULL`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`professionals\` DROP COLUMN \`businessLogo\``);
    }

}
