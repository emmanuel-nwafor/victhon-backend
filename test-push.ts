import PushNotificationService from "./src/services/PushNotificationService";
import { AppDataSource } from "./src/data-source";
import { UserType } from "./src/types/constants";
import { User } from "./src/entities/User";
import { Professional } from "./src/entities/Professional";
import { Not, IsNull } from "typeorm";

async function test() {
    try {
        await AppDataSource.initialize();
        console.log("Connected to Database");

        const pushService = new PushNotificationService();
        
        // Find a User with a pushToken
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOne({ where: { pushToken: Not(IsNull()) } });

        if (user) {
            console.log(`Sending to User ${user.email} with token ${user.pushToken}...`);
            await pushService.sendToUser(user.id, UserType.USER, "Test from Victhon", "Hello User! This is a test push notification.", { test: true });
        } else {
            console.log("No User found with a pushToken.");
        }

        // Find a Professional with a pushToken
        const proRepo = AppDataSource.getRepository(Professional);
        const pro = await proRepo.findOne({ where: { pushToken: Not(IsNull()) } });

        if (pro) {
            console.log(`Sending to Professional ${pro.email} with token ${pro.pushToken}...`);
            await pushService.sendToUser(pro.id, UserType.PROFESSIONAL, "Test from Victhon", "Hello Professional! This is a test push notification.", { test: true });
        } else {
            console.log("No Professional found with a pushToken.");
        }

        process.exit(0);
    } catch(e) {
        console.error("Failed:", e);
        process.exit(1);
    }
}
test();
