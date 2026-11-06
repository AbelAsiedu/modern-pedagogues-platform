CREATE TYPE "public"."tutor_status" AS ENUM('PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "tutor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "tutor_status" DEFAULT 'PENDING' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'application' NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"qualifications" text DEFAULT '' NOT NULL,
	"experience" text DEFAULT '' NOT NULL,
	"availability" text DEFAULT '' NOT NULL,
	"admin_notes" text,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp (3) with time zone,
	"display_name" text,
	"headline" text,
	"bio" text,
	"subjects" text[] DEFAULT '{}'::text[] NOT NULL,
	"level_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"curriculum_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"modes" text[] DEFAULT '{}'::text[] NOT NULL,
	"areas" text,
	"years_experience" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_profiles_email_lower" CHECK ("tutor_profiles"."email" = lower("tutor_profiles"."email")),
	CONSTRAINT "tutor_profiles_published_needs_approval" CHECK (NOT "tutor_profiles"."is_published" OR "tutor_profiles"."status" = 'APPROVED')
);
--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutor_profiles_status_idx" ON "tutor_profiles" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "tutor_profiles_public_idx" ON "tutor_profiles" USING btree ("status","is_published","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_profiles_email_live_uq" ON "tutor_profiles" USING btree ("email") WHERE status <> 'REJECTED';