import { Pool } from "@neondatabase/serverless";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import type { Db } from "./types";

let db: Db | undefined;

/**
 * Uses Neon's WebSocket Pool rather than the HTTP driver because the draw needs
 * a real interactive transaction. Created on first use so builds need no DB.
 */
export function getDb(): Db {
  if (db) return db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString, max: 5 });
  pool.on("error", (error: Error) => console.error("Neon pool error", error));
  attachDatabasePool(pool);

  db = drizzle(pool, { schema });
  return db;
}
