import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Professional } from "../entities/Professional";
import Password from "../utils/Password";
import * as dotenv from "dotenv";
import { AuthProvider } from "../types/constants";

dotenv.config();

async function seed() {
    try {
        console.log("🚀 Starting Seeding...");
        await AppDataSource.initialize();
        console.log("📅 Database Connection Initialized");

        const userRepo = AppDataSource.getRepository(User);
        const proRepo = AppDataSource.getRepository(Professional);

        const salt = process.env.STORED_SALT || "f766a189bd3c8071f399b7866a7e2381";
        const hashedPassword = Password.hashPassword("@123456Bi", salt);

        // 1. Create Provider
        const proEmail = "echinecherem729@gmail.com";
        let pro = await proRepo.findOneBy({ email: proEmail });
        if (!pro) {
            pro = proRepo.create({
                email: proEmail,
                password: hashedPassword,
                firstName: "Chinecherem",
                lastName: "Provider",
                isVerified: true,
                isActive: true,
                authProvider: AuthProvider.LOCAL,
                businessName: "Chinecherem Services",
                businessCategory: "Cleaning",
                businessType: "Individual",
                location: {
                    type: "Point",
                    coordinates: [6.5244, 3.3792] // Lagos coords
                } as any
            });
            await proRepo.save(pro);
            console.log("✅ Provider created:", proEmail);
        } else {
            console.log("ℹ️ Provider already exists:", proEmail);
        }

        // 2. Create Customer
        const userEmail = "echinecherem7299@gmail.com";
        let user = await userRepo.findOneBy({ email: userEmail });
        if (!user) {
            user = userRepo.create({
                email: userEmail,
                password: hashedPassword,
                firstName: "Chinecherem",
                lastName: "Customer",
                isVerified: true,
                isActive: true,
                authProvider: AuthProvider.LOCAL
            });
            await userRepo.save(user);
            console.log("✅ Customer created:", userEmail);
        } else {
            console.log("ℹ️ Customer already exists:", userEmail);
        }

        console.log("🏁 Seeding Completed!");
        await AppDataSource.destroy();
    } catch (error) {
        console.error("❌ Seeding Failed:", error);
        process.exit(1);
    }
}

seed();
