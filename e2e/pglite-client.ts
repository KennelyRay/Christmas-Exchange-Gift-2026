// Test-only stand-in for src/db/client.ts, swapped in by E2E_PGLITE=1 in
// next.config.ts. It lets the app run in a browser with no Neon account.
// Production never imports this file.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import type { Db } from "../src/db/types";

const store = globalThis as unknown as { e2eDb?: Promise<Db> };

async function start(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as Db;
}

const db = await (store.e2eDb ??= start());

export const getDb = () => db;
