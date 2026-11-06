CREATE TABLE "assistant_chat_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL,
	"provider" text,
	"message" text NOT NULL,
	"answer" text NOT NULL,
	"latency_ms" integer
);
--> statement-breakpoint
CREATE TABLE "assistant_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"updated_by_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_knowledge" ADD CONSTRAINT "assistant_knowledge_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_knowledge" ADD CONSTRAINT "assistant_knowledge_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_chat_logs_created_idx" ON "assistant_chat_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "assistant_chat_logs_outcome_idx" ON "assistant_chat_logs" USING btree ("outcome","created_at");--> statement-breakpoint
CREATE INDEX "assistant_knowledge_active_idx" ON "assistant_knowledge" USING btree ("is_active","sort_order");