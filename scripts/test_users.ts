import { AppDataSource } from "../src/data-source";
import { User } from "../src/entities/User";

async function test() {
    console.log("Connecting database...");
    await AppDataSource.initialize();

    console.log("Querying users...");
    const userRepo = AppDataSource.getRepository(User);

    try {
        const result = await userRepo.findAndCount();
        console.log("SUCCESS. Total users:", result[1]);
        console.log("Users:", JSON.stringify(result[0].slice(0, 1), null, 2));
    } catch (e) {
        console.error("ERROR QUERYING USERS:");
        console.error(e);
    }

    await AppDataSource.destroy();
    process.exit(0);
}

test().catch(console.error);
