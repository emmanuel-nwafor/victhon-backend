import mysql from 'mysql2/promise';
import env, { EnvKey } from '../src/config/env';
import Password from '../src/utils/Password';

const dbUrl = env(EnvKey.DATABASE_URL);

async function check() {
    console.log("Connecting to", dbUrl);
    const conn = await mysql.createConnection({
        uri: dbUrl!,
        ssl: {
            rejectUnauthorized: false
        }
    });
    console.log("Connected");
    const [rows]: any = await conn.execute('SELECT * FROM admins');
    console.log(`Found ${rows.length} admins.`);

    if (rows.length > 0) {
        const admin = rows[0];
        console.log("Admin email:", admin.email);

        const inputPassword = process.env.DEFAULT_ADMIN_PASSWORD;
        const storedSalt = env(EnvKey.STORED_SALT);

        const valid = Password.compare(inputPassword!, admin.password, storedSalt!);
        console.log("Password valid:", valid);
    }

    await conn.end();
}

check().catch(console.error);
