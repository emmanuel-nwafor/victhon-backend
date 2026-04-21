import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateActivityLogTable1775943480355 implements MigrationInterface {
    name = 'CreateActivityLogTable1775943480355'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Safe check for foreign key on transactions table
        const transactionsTable = await queryRunner.getTable("transactions");
        if (transactionsTable) {
            const foreignKey = transactionsTable.foreignKeys.find(fk => fk.name === "FK_b1630a0b9be02ae4be5dff17821");
            if (foreignKey) {
                await queryRunner.dropForeignKey("transactions", foreignKey);
            }
            
            // Safe drop columns
            const hasDisputeId = transactionsTable.columns.find(c => c.name === "disputeId");
            if (hasDisputeId) await queryRunner.dropColumn("transactions", "disputeId");
            
            const hasDisputesId = transactionsTable.columns.find(c => c.name === "disputesId");
            if (hasDisputesId) await queryRunner.dropColumn("transactions", "disputesId");
        }

        // Safe drop index on admins
        const adminsTable = await queryRunner.getTable("admins");
        if (adminsTable) {
            const emailIndex = adminsTable.indices.find(idx => idx.columnNames.includes("email") && idx.name === "IDX_ADMIN_EMAIL");
            if (emailIndex) {
                await queryRunner.dropIndex("admins", emailIndex);
            }
            
            // Check if unique index already exists before adding
            const newIndexName = "IDX_051db7d37d478a69a7432df147";
            const hasNewIndex = adminsTable.indices.find(idx => idx.name === newIndexName);
            if (!hasNewIndex) {
                await queryRunner.query(`ALTER TABLE \`admins\` ADD UNIQUE INDEX \`${newIndexName}\` (\`email\`)`);
            }
        }

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`platform_settings\` (\`id\` varchar(36) NOT NULL, \`platformFeePercentage\` decimal(5,2) NOT NULL DEFAULT '0.00', \`fixedFee\` decimal(10,2) NOT NULL DEFAULT '0.00', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`activity_logs\` (\`id\` varchar(36) NOT NULL, \`adminId\` varchar(255) NULL, \`action\` varchar(255) NOT NULL, \`details\` json NULL, \`ipAddress\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        
        await queryRunner.query(`ALTER TABLE \`notifications\` CHANGE \`type\` \`type\` enum ('system', 'booking', 'acceptedBooking', 'rejectedBooking', 'viewProfile', 'bookingPayment', 'escrow_release', 'review_booking', 'cancelBooking', 'refundBooking', 'refundFailed', 'disputed', 'new_review', 'chat', 'on_the_way', 'completed', 'welcome') NOT NULL DEFAULT 'system'`);
        
        // Safe add constraint for activity_logs
        const activityLogsTable = await queryRunner.getTable("activity_logs");
        if (activityLogsTable) {
            const adminFk = activityLogsTable.foreignKeys.find(fk => fk.name === "FK_1ce658094e7e55ec35c1a12d953");
            if (!adminFk) {
                await queryRunner.query(`ALTER TABLE \`activity_logs\` ADD CONSTRAINT \`FK_1ce658094e7e55ec35c1a12d953\` FOREIGN KEY (\`adminId\`) REFERENCES \`admins\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`activity_logs\` DROP FOREIGN KEY \`FK_1ce658094e7e55ec35c1a12d953\``);
        await queryRunner.query(`ALTER TABLE \`admins\` DROP INDEX \`IDX_051db7d37d478a69a7432df147\``);
        await queryRunner.query(`ALTER TABLE \`notifications\` CHANGE \`type\` \`type\` enum ('system', 'booking', 'acceptedBooking', 'rejectedBooking', 'viewProfile', 'bookingPayment', 'escrow_release', 'review_booking', 'cancelBooking', 'refundBooking', 'refundFailed', 'disputed', 'new_review', 'chat', 'on_the_way', 'completed') NOT NULL DEFAULT 'system'`);
        await queryRunner.query(`ALTER TABLE \`transactions\` ADD \`disputesId\` varchar(36) NULL`);
        await queryRunner.query(`ALTER TABLE \`transactions\` ADD \`disputeId\` varchar(255) NULL`);
        await queryRunner.query(`DROP TABLE \`activity_logs\``);
        await queryRunner.query(`DROP TABLE \`platform_settings\``);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_ADMIN_EMAIL\` ON \`admins\` (\`email\`)`);
        await queryRunner.query(`ALTER TABLE \`transactions\` ADD CONSTRAINT \`FK_b1630a0b9be02ae4be5dff17821\` FOREIGN KEY (\`disputesId\`) REFERENCES \`disputes\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
