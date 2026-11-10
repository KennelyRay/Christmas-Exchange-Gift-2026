import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED, max: 1 });
const one = async (sql) => (await pool.query(sql)).rows[0];
const state = {
  host: new URL(process.env.DATABASE_URL_UNPOOLED).hostname,
  migrations: (await one("select count(*)::int n from drizzle.__drizzle_migrations")).n,
  photoUploadsTable: Boolean(await one("select 1 as x from information_schema.tables where table_name = 'photo_uploads'")),
  imageKeyColumn: Boolean(await one("select 1 as x from information_schema.columns where table_name = 'wishlist_items' and column_name = 'image_key'")),
  exchanges: (await one("select count(*)::int n from exchanges")).n,
  participants: (await one("select count(*)::int n from participants")).n,
  wishlistItems: (await one("select count(*)::int n from wishlist_items")).n,
  assignments: (await one("select count(*)::int n from assignments")).n,
  auditLog: (await one("select count(*)::int n from audit_log")).n,
};
console.log(JSON.stringify(state));
await pool.end();
