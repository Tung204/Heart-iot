CREATE TABLE "care_reminder_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"scheduled_time" text NOT NULL,
	"status" text NOT NULL,
	"completed_by_user_id" uuid,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_reminder_completions_status_chk" CHECK ("care_reminder_completions"."status" in ('done', 'skipped')),
	CONSTRAINT "care_reminder_completions_time_chk" CHECK ("care_reminder_completions"."scheduled_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "care_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"times" jsonb NOT NULL,
	"weekdays" jsonb NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "care_reminder_completions" ADD CONSTRAINT "care_reminder_completions_reminder_id_care_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."care_reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_reminder_completions" ADD CONSTRAINT "care_reminder_completions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_reminder_completions" ADD CONSTRAINT "care_reminder_completions_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_reminders" ADD CONSTRAINT "care_reminders_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "care_reminder_completions_key_uq" ON "care_reminder_completions" USING btree ("reminder_id","occurrence_date","scheduled_time");--> statement-breakpoint
CREATE INDEX "care_reminder_completions_reminder_idx" ON "care_reminder_completions" USING btree ("reminder_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "care_reminders_subject_idx" ON "care_reminders" USING btree ("subject_id","starts_on");