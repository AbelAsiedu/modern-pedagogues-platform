CREATE TABLE "media_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"alt_text" text DEFAULT '' NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_files_created_idx" ON "media_files" USING btree ("created_at");