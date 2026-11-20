CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_key" text NOT NULL,
	"run_key" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text DEFAULT 'running' NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "job_runs_outcome_chk" CHECK ("job_runs"."outcome" in ('running', 'succeeded', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "subject_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_rules_kind_chk" CHECK ("subject_rules"."kind" in ('inactivity', 'care_digest'))
);
--> statement-breakpoint
ALTER TABLE "subject_rules" ADD CONSTRAINT "subject_rules_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_rules" ADD CONSTRAINT "subject_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_key_uq" ON "job_runs" USING btree ("job_key","run_key");--> statement-breakpoint
CREATE INDEX "job_runs_started_idx" ON "job_runs" USING btree ("job_key","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subject_rules_version_uq" ON "subject_rules" USING btree ("subject_id","kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "subject_rules_active_uq" ON "subject_rules" USING btree ("subject_id","kind") WHERE active;--> statement-breakpoint
CREATE INDEX "subject_rules_kind_idx" ON "subject_rules" USING btree ("kind","active");