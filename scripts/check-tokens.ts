import { AppDataSource } from "../src/data-source";
import { User } from "../src/entities/User";
import { Professional } from "../src/entities/Professional";
import { Not, IsNull } from "typeorm";

async function check() {
    try {
        await AppDataSource.initialize();
        const userRepo = AppDataSource.getRepository(User);
        const usersWithToken = await userRepo.count({ where: { pushToken: Not(IsNull()) } });
        console.log(`Users with pushToken: ${usersWithToken}`);

        const proRepo = AppDataSource.getRepository(Professional);
        const prosWithToken = await proRepo.count({ where: { pushToken: Not(IsNull()) } });
        console.log(`Professionals with pushToken: ${prosWithToken}`);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
