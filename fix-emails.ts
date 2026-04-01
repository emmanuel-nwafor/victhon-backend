import { AppDataSource } from "./src/data-source";
import { normalizeEmail } from "./src/utils/normalizeEmail";

AppDataSource.initialize().then(async () => {
    const users = await AppDataSource.query(`SELECT id, email FROM \`users\``);
    for (const u of users) {
        const norm = normalizeEmail(u.email);
        if (norm !== u.email) {
            try {
                await AppDataSource.query(`UPDATE \`users\` SET email = ? WHERE id = ?`, [norm, u.id]);
            } catch (e: any) {
                if (e.code === 'ER_DUP_ENTRY') {
                    console.log('Deleting duplicate user', norm);
                    await AppDataSource.query(`DELETE FROM \`users\` WHERE email = ?`, [norm]);
                    await AppDataSource.query(`UPDATE \`users\` SET email = ? WHERE id = ?`, [norm, u.id]);
                }
            }
        }
    }
    
    const pros = await AppDataSource.query(`SELECT id, email FROM \`professionals\``);
    for (const p of pros) {
        const norm = normalizeEmail(p.email);
        if (norm !== p.email) {
            try {
                await AppDataSource.query(`UPDATE \`professionals\` SET email = ? WHERE id = ?`, [norm, p.id]);
            } catch (e: any) {
                if (e.code === 'ER_DUP_ENTRY') {
                    console.log('Deleting duplicate professional', norm);
                    await AppDataSource.query(`DELETE FROM \`professionals\` WHERE email = ?`, [norm]);
                    await AppDataSource.query(`UPDATE \`professionals\` SET email = ? WHERE id = ?`, [norm, p.id]);
                }
            }
        }
    }

    console.log('Update complete');
    process.exit(0);
}).catch((e) => {
    console.error(e);
    process.exit(1);
});
