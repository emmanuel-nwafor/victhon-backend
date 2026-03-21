import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLastMessageToChat1774050936489 implements MigrationInterface {
    name = 'AddLastMessageToChat1774050936489'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`chats\` ADD \`lastMessageId\` varchar(255) NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`REL_5768a56bdd855c5b78ce66c9a3\` ON \`chats\` (\`lastMessageId\`)`);
        await queryRunner.query(`ALTER TABLE \`chats\` ADD CONSTRAINT \`FK_5768a56bdd855c5b78ce66c9a37\` FOREIGN KEY (\`lastMessageId\`) REFERENCES \`messages\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`chats\` DROP FOREIGN KEY \`FK_5768a56bdd855c5b78ce66c9a37\``);
        await queryRunner.query(`DROP INDEX \`REL_5768a56bdd855c5b78ce66c9a3\` ON \`chats\``);
        await queryRunner.query(`ALTER TABLE \`chats\` DROP COLUMN \`lastMessageId\``);
    }

}
