const mysql = require('mysql2/promise');
require('dotenv').config();

async function test() {
    console.log("Connecting database directly...");
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    
    console.log("Counting users...");
    const [counts] = await connection.execute('SELECT COUNT(*) as c FROM users');
    console.log("TOTAL USERS:", counts[0].c);

    console.log("Fetching some users...");
    const [rows] = await connection.execute('SELECT * FROM users LIMIT 1');
    console.log("USERS:", rows);
    
    process.exit(0);
}

test().catch(console.error);
