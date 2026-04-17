import "reflect-metadata"
import { DataSource } from "typeorm";
import env, { EnvKey } from "./config/env";

const envType = env(EnvKey.ENV_TYPE)

export const AppDataSource = new DataSource({
    type: "mysql",
    url: env(EnvKey.DATABASE_URL)!,
    synchronize: true,
    logging: true,
    // logging: process.env.NODE_ENV === 'development' ? true : false,
    entities: [envType == "dev" ? "src/entities/*.ts" : "dist/entities/*.js"],
    migrations: [envType == "dev" ? "src/migrations/*.ts" : "dist/migrations/*.js"],
    migrationsTableName: "typeorm_migrations",
    extra: {
        flags: ["FOUND_ROWS"]
    },
    legacySpatialSupport: false

});
