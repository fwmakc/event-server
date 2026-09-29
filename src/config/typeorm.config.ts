import * as dotenv from "dotenv";
import { join } from "path";
import { DataSource, DataSourceOptions } from "typeorm";

dotenv.config();

const config = {
  type: "postgres" as const,
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "event_server",

  entities: [join(__dirname, "../**/*.entity{.ts,.js}")],
  migrations: [join(__dirname, "../typeorm/migrations/*{.ts,.js}")],
  migrationsTableName: "migrations_typeorm",
} as DataSourceOptions;

// No module-level initialize(): the TypeORM CLI loads and initializes the
// data-source itself, and a second initialize() here races with it, making
// migration commands flaky. The app connects via its own DatabaseModule.
const AppDataSource = new DataSource(config);

export default AppDataSource;
