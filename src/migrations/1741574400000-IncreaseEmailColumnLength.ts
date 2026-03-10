import { MigrationInterface, QueryRunner } from "typeorm";

export class IncreaseEmailColumnLength1741574400000 implements MigrationInterface {
    name = 'IncreaseEmailColumnLength1741574400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` MODIFY \`email\` varchar(254) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`professionals\` MODIFY \`email\` varchar(254) NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`professionals\` MODIFY \`email\` varchar(50) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` MODIFY \`email\` varchar(50) NOT NULL`);
    }

}
