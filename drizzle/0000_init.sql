CREATE TYPE "public"."audit_event" AS ENUM('exchange_created', 'participant_joined', 'budget_changed', 'reveal_time_changed', 'exclusions_changed', 'pool_locked', 'pool_reopened', 'draw_run', 'draw_reset', 'code_reissued', 'chain_started', 'seal_opened');--> statement-breakpoint
CREATE TYPE "public"."exchange_status" AS ENUM('open', 'locked', 'drawn');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exchange_id" uuid NOT NULL,
	"giver_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"sealed_recipient" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"exchange_id" uuid NOT NULL,
	"event" "audit_event" NOT NULL,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"organizer_code_hash" text NOT NULL,
	"budget_hint_centavos" integer,
	"status" "exchange_status" DEFAULT 'open' NOT NULL,
	"reveal_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"drawn_at" timestamp with time zone,
	"draw_generation" integer DEFAULT 0 NOT NULL,
	"commitment_hash" text,
	"sealed_manifest" text,
	"opened_manifest" text,
	"seal_opened_at" timestamp with time zone,
	"chain_step" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchanges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exchange_id" uuid NOT NULL,
	"participant_a_id" uuid NOT NULL,
	"participant_b_id" uuid NOT NULL,
	CONSTRAINT "exclusions_canonical_order" CHECK ("exclusions"."participant_a_id" < "exclusions"."participant_b_id")
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exchange_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"name_key" text NOT NULL,
	"elf_code_hash" text NOT NULL,
	"code_reissued_at" timestamp with time zone,
	"first_opened_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"price_centavos" integer NOT NULL,
	"url" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlist_items_price_positive" CHECK ("wishlist_items"."price_centavos" > 0)
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_giver_id_participants_id_fk" FOREIGN KEY ("giver_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusions" ADD CONSTRAINT "exclusions_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusions" ADD CONSTRAINT "exclusions_participant_a_id_participants_id_fk" FOREIGN KEY ("participant_a_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusions" ADD CONSTRAINT "exclusions_participant_b_id_participants_id_fk" FOREIGN KEY ("participant_b_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_exchange_giver_key" ON "assignments" USING btree ("exchange_id","giver_id");--> statement-breakpoint
CREATE INDEX "audit_log_exchange_idx" ON "audit_log" USING btree ("exchange_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "exclusions_pair_key" ON "exclusions" USING btree ("exchange_id","participant_a_id","participant_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_exchange_name_key" ON "participants" USING btree ("exchange_id","name_key");--> statement-breakpoint
CREATE INDEX "participants_exchange_idx" ON "participants" USING btree ("exchange_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_items_participant_position_key" ON "wishlist_items" USING btree ("participant_id","position");