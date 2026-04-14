import { AppDataSource } from "../src/data-source";
import { Admin } from "../src/entities/Admin";
import Password from "../src/utils/Password";
import env, { EnvKey } from "../src/config/env";

AppDataSource.initialize().then(async () => {
    const adminRepo = AppDataSource.getRepository(Admin);
    const admin = await adminRepo.createQueryBuilder("admin").addSelect("admin.password").getOne();
    console.log("Admin exists?", !!admin);
    if (admin) {
        console.log("Admin email:", admin.email);
        console.log("Admin isActive:", admin.isActive);
        const inputPassword = process.env.DEFAULT_ADMIN_PASSWORD;
        console.log("Input Password from env:", inputPassword);
        const storedSalt = env(EnvKey.STORED_SALT);

        console.log("DB password length:", admin.password.length);
        console.log("Stored Salt length:", storedSalt.length);
        const valid = Password.compare(inputPassword, admin.password, storedSalt);
        console.log("Valid?", valid);
    }
    process.exit(0);
}).catch(console.error);
