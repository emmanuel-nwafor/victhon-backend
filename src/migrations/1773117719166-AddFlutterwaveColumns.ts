import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFlutterwaveColumns1773117719166 implements MigrationInterface {
    name = 'AddFlutterwaveColumns1773117719166'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`transactions\` DROP COLUMN \`accessCode\``);
        await queryRunner.query(`ALTER TABLE \`transactions\` ADD \`flwTransactionId\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`transactions\` ADD \`paymentLink\` varchar(255) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`transactions\` DROP COLUMN \`paymentLink\``);
        await queryRunner.query(`ALTER TABLE \`transactions\` DROP COLUMN \`flwTransactionId\``);
        await queryRunner.query(`ALTER TABLE \`transactions\` ADD \`accessCode\` varchar(255) NULL`);
    }

}
