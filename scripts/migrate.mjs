// Applies migrations over Neon's direct (unpooled) connection.
// Usage: npm run db:migrate
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) {
  console.error("DATABASE_URL_UNPOOLED is not set. Use the direct connection string from Neon.");
  process.exit(1);
}

const { hostname } = new URL(connectionString);
if (hostname.includes("-pooler")) {
  console.error("DATABASE_URL_UNPOOLED points at a pooled host. Use the direct connection string.");
  process.exit(1);
}

// Printed so it is obvious which Neon branch is about to change.
console.log(`Migrating ${hostname}`);

const pool = new Pool({ connectionString, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
