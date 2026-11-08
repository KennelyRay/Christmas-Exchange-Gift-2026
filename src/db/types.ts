import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Common shape of the Neon client and the PGlite client used in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
