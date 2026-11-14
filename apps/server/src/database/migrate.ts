import "../environment.js";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const client = postgres(databaseUrl, { max: 1 });
const database = drizzle(client);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

try {
  await migrate(database, {
    migrationsFolder: path.resolve(moduleDirectory, "../../drizzle"),
  });
} finally {
  await client.end();
}
