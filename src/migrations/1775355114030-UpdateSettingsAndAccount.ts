import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateSettingsAndAccount1775355114030 implements MigrationInterface {
    name = 'UpdateSettingsAndAccount1775355114030'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`accounts\` ADD \`isLocked\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`settings\` ADD \`userId\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`settings\` ADD UNIQUE INDEX \`IDX_9175e059b0a720536f7726a88c\` (\`userId\`)`);
        await queryRunner.query(`ALTER TABLE \`settings\` ADD \`biometricsEnabled\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`settings\` DROP FOREIGN KEY \`FK_16862a22c10bbe05d3064582e5e\``);
        await queryRunner.query(`ALTER TABLE \`settings\` CHANGE \`professionalId\` \`professionalId\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`notifications\` CHANGE \`type\` \`type\` enum ('system', 'booking', 'acceptedBooking', 'rejectedBooking', 'viewProfile', 'bookingPayment', 'escrow_release', 'review_booking', 'cancelBooking', 'refundBooking', 'refundFailed', 'disputed', 'new_review', 'chat', 'on_the_way', 'completed') NOT NULL DEFAULT 'system'`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`REL_9175e059b0a720536f7726a88c\` ON \`settings\` (\`userId\`)`);
        await queryRunner.query(`ALTER TABLE \`settings\` ADD CONSTRAINT \`FK_16862a22c10bbe05d3064582e5e\` FOREIGN KEY (\`professionalId\`) REFERENCES \`professionals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`settings\` ADD CONSTRAINT \`FK_9175e059b0a720536f7726a88c7\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`settings\` DROP FOREIGN KEY \`FK_9175e059b0a720536f7726a88c7\``);
        await queryRunner.query(`ALTER TABLE \`settings\` DROP FOREIGN KEY \`FK_16862a22c10bbe05d3064582e5e\``);
        await queryRunner.query(`DROP INDEX \`REL_9175e059b0a720536f7726a88c\` ON \`settings\``);
        await queryRunner.query(`ALTER TABLE \`notifications\` CHANGE \`type\` \`type\` enum ('system', 'booking', 'acceptedBooking', 'rejectedBooking', 'viewProfile', 'bookingPayment', 'escrow_release', 'review_booking', 'cancelBooking', 'refundBooking', 'refundFailed', 'disputed', 'new_review') NOT NULL DEFAULT 'system'`);
        await queryRunner.query(`ALTER TABLE \`settings\` CHANGE \`professionalId\` \`professionalId\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`settings\` ADD CONSTRAINT \`FK_16862a22c10bbe05d3064582e5e\` FOREIGN KEY (\`professionalId\`) REFERENCES \`professionals\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`settings\` DROP COLUMN \`biometricsEnabled\``);
        await queryRunner.query(`ALTER TABLE \`settings\` DROP INDEX \`IDX_9175e059b0a720536f7726a88c\``);
        await queryRunner.query(`ALTER TABLE \`settings\` DROP COLUMN \`userId\``);
        await queryRunner.query(`ALTER TABLE \`accounts\` DROP COLUMN \`isLocked\``);
    }

}
