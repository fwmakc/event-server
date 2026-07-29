import * as dotenv from "dotenv";
import { join } from "path";
import { DataSource, DataSourceOptions } from "typeorm";

dotenv.config();

const config = {
  type: "postgres" as const,
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "1234",
  database: process.env.DB_NAME || "event_server",

  entities: [join(__dirname, "../**/*.entity{.ts,.js}")],
  migrations: [join(__dirname, "../typeorm/migrations/*{.ts,.js}")],
  migrationsTableName: "migrations_typeorm",
} as DataSourceOptions;

const AppDataSource = new DataSource(config);

AppDataSource.initialize()
  .then(() => {
    console.log("Data Source has been initialized!");
  })
  .catch((e) => {
    console.error("Error during Data Source initialization", e);
  });

export default AppDataSource;
