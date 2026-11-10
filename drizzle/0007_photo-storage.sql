CREATE TABLE "photo_uploads" (
	"key" text PRIMARY KEY NOT NULL,
	"exchange_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"attached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "photo_uploads" ADD CONSTRAINT "photo_uploads_exchange_id_exchanges_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchanges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_uploads_cleanup_idx" ON "photo_uploads" USING btree ("attached","created_at");