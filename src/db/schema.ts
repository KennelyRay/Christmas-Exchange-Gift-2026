import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const exchangeStatus = pgEnum("exchange_status", ["open", "locked", "drawn"]);

export const auditEvent = pgEnum("audit_event", [
  "exchange_created",
  "participant_joined",
  "budget_changed",
  "reveal_time_changed",
  "exclusions_changed",
  "pool_locked",
  "pool_reopened",
  "draw_run",
  "draw_reset",
  "code_reissued",
  "chain_started",
  "seal_opened",
]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const exchanges = pgTable("exchanges", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  organizerCodeHash: text("organizer_code_hash").notNull(),
  budgetHintCentavos: integer("budget_hint_centavos"),
  status: exchangeStatus("status").notNull().default("open"),
  /** Gift Chain mode and the seal stay shut until this moment. Frozen by the draw. */
  revealAt: timestamp("reveal_at", { withTimezone: true }).notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  drawnAt: timestamp("drawn_at", { withTimezone: true }),
  /** Counts every draw ever run, so a reset can never look like the first draw. */
  drawGeneration: integer("draw_generation").notNull().default(0),
  commitmentHash: text("commitment_hash"),
  /** AES-GCM ciphertext of the manifest that commitment_hash commits to. */
  sealedManifest: text("sealed_manifest"),
  /** The exact committed text, published only when the seal is opened. */
  openedManifest: text("opened_manifest"),
  sealOpenedAt: timestamp("seal_opened_at", { withTimezone: true }),
  chainStep: integer("chain_step").notNull().default(0),
  createdAt: createdAt(),
});

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exchangeId: uuid("exchange_id")
      .notNull()
      .references(() => exchanges.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** Normalized last name. Everyone sharing it is one family and can't draw each other. */
    lastNameKey: text("last_name_key").notNull(),
    /** Normalized full name, for duplicate checks. */
    nameKey: text("name_key").notNull(),
    elfCodeHash: text("elf_code_hash").notNull(),
    codeReissuedAt: timestamp("code_reissued_at", { withTimezone: true }),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("participants_exchange_name_key").on(t.exchangeId, t.nameKey),
    index("participants_exchange_idx").on(t.exchangeId),
  ],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    priceCentavos: integer("price_centavos").notNull(),
    url: text("url"),
    imageUrl: text("image_url"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("wishlist_items_participant_position_key").on(t.participantId, t.position),
    check("wishlist_items_price_positive", sql`${t.priceCentavos} > 0`),
  ],
);

export const exclusions = pgTable(
  "exclusions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exchangeId: uuid("exchange_id")
      .notNull()
      .references(() => exchanges.id),
    participantAId: uuid("participant_a_id")
      .notNull()
      .references(() => participants.id),
    participantBId: uuid("participant_b_id")
      .notNull()
      .references(() => participants.id),
  },
  (t) => [
    uniqueIndex("exclusions_pair_key").on(t.exchangeId, t.participantAId, t.participantBId),
    check("exclusions_canonical_order", sql`${t.participantAId} < ${t.participantBId}`),
  ],
);

/**
 * One row per giver. The recipient and the chain position are encrypted
 * together, because a plain position would reveal the whole chain. Rows are
 * written in join order for the same reason.
 */
export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exchangeId: uuid("exchange_id")
      .notNull()
      .references(() => exchanges.id),
    giverId: uuid("giver_id")
      .notNull()
      .references(() => participants.id),
    generation: integer("generation").notNull(),
    sealedRecipient: text("sealed_recipient").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("assignments_exchange_giver_key").on(t.exchangeId, t.giverId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    exchangeId: uuid("exchange_id")
      .notNull()
      .references(() => exchanges.id),
    event: auditEvent("event").notNull(),
    /** Shown to everyone on the lobby, so it must never mention an assignment. */
    detail: text("detail").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_exchange_idx").on(t.exchangeId, t.id)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowEndsAt: timestamp("window_ends_at", { withTimezone: true }).notNull(),
});
