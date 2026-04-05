import "reflect-metadata";
import { AppDataSource } from "../src/data-source";
import { User } from "../src/entities/User";
import { Professional } from "../src/entities/Professional";
import Password from "../src/utils/Password";
import env, { EnvKey } from "../src/config/env";

async function run() {
    try {
        console.log("Initializing database connection...");
        await AppDataSource.initialize();

        const email = "nwafor.synthdatasolution@gmail.com";
        const password = "@123456Bi";
        const salt = env(EnvKey.STORED_SALT)!;

        console.log(`Target Email: ${email}`);

        // 1. Delete existing records from both tables to ensure a clean slate
        const userRepo = AppDataSource.getRepository(User);
        const proRepo = AppDataSource.getRepository(Professional);

        const existingUser = await userRepo.findOneBy({ email });
        if (existingUser) {
            console.log(`Found existing user record. Deleting ID: ${existingUser.id}`);
            // Use delete to avoid issues with relations if they aren't fully loaded
            await userRepo.delete({ id: existingUser.id });
            console.log("User record deleted.");
        }

        const existingPro = await proRepo.findOneBy({ email });
        if (existingPro) {
            console.log(`Found existing professional record. Deleting ID: ${existingPro.id}`);
            await proRepo.delete({ id: existingPro.id });
            console.log("Professional record deleted.");
        }

        // 2. Hash the new password
        const hashedPassword = Password.hashPassword(password, salt);

        // 3. Create new Professional record
        const newPro = proRepo.create({
            email,
            password: hashedPassword,
            isVerified: true,
            isActive: true,
            location: `POINT(0 0)` as any, // Defaulting location as seen in Authentication service
        });

        await proRepo.save(newPro);
        console.log(`Successfully recreated ${email} as a Professional.`);

    } catch (error) {
        console.error("Migration script failed:", error);
    } finally {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
    }
}

run();
