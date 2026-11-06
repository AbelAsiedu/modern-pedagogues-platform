CREATE TYPE "public"."resource_kind" AS ENUM('BOOK', 'COURSE', 'STUDY_GUIDE', 'WORKSHEET', 'PAST_QUESTIONS', 'LESSON_PLAN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."resource_status" AS ENUM('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "creator_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"reference" text NOT NULL,
	"paid_by_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_payouts_positive" CHECK ("creator_payouts"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"payout_phone" text,
	"terms_version" integer NOT NULL,
	"terms_accepted_at" timestamp (3) with time zone NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"submission" integer DEFAULT 0 NOT NULL,
	"reviewer_id" uuid,
	"decision" text NOT NULL,
	"rubric_version" integer DEFAULT 1 NOT NULL,
	"scores" jsonb,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_price_positive";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_published_needs_file";--> statement-breakpoint
DROP INDEX "products_public_idx";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "creator_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "commission_bps" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "creator_share_minor" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "platform_share_minor" bigint;--> statement-breakpoint
ALTER TABLE "product_files" ADD COLUMN "pages" integer;--> statement-breakpoint
ALTER TABLE "product_files" ADD COLUMN "inspection_notes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "pending_file_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "kind" "resource_kind" DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "status" "resource_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "author_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "subject" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "level_keys" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "curriculum_keys" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "language" text DEFAULT 'English' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "outcomes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "audience" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "table_of_contents" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "download_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "declared_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "declaration_version" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "submitted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "submission_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "approved_at" timestamp (3) with time zone;--> statement-breakpoint
-- Products that existed before creators were TMP's own, so they count as approved (visibility is still controlled by is_published).
UPDATE "products" SET "status" = 'APPROVED', "approved_at" = now();--> statement-breakpoint
ALTER TABLE "creator_payouts" ADD CONSTRAINT "creator_payouts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_payouts" ADD CONSTRAINT "creator_payouts_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_reviews" ADD CONSTRAINT "resource_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_reviews" ADD CONSTRAINT "resource_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_payouts_creator_idx" ON "creator_payouts" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "resource_reviews_product_idx" ON "resource_reviews" USING btree ("product_id","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_pending_file_id_product_files_id_fk" FOREIGN KEY ("pending_file_id") REFERENCES "public"."product_files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_owner_idx" ON "products" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "products_public_idx" ON "products" USING btree ("status","is_published","sort_order");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_not_negative" CHECK ("products"."price_minor" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_published_needs_file_and_approval" CHECK (NOT "products"."is_published" OR ("products"."file_id" IS NOT NULL AND "products"."status" = 'APPROVED'));