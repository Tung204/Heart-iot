CREATE TYPE "public"."assistant_draft_status" AS ENUM('draft', 'confirmed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "assistant_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"payload" jsonb NOT NULL,
	"preview_digest" text NOT NULL,
	"status" "assistant_draft_status" DEFAULT 'draft' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_user_id" uuid,
	"result_type" text,
	"result_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_drafts" ADD CONSTRAINT "assistant_drafts_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_drafts" ADD CONSTRAINT "assistant_drafts_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_drafts" ADD CONSTRAINT "assistant_drafts_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_drafts_actor_idx" ON "assistant_drafts" USING btree ("actor_user_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "assistant_drafts_subject_idx" ON "assistant_drafts" USING btree ("subject_id","created_at");