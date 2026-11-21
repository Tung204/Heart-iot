CREATE TABLE "care_reminder_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"active_from" date NOT NULL,
	"active_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_reminder_periods_range_chk" CHECK ("care_reminder_periods"."active_to" is null or "care_reminder_periods"."active_to" >= "care_reminder_periods"."active_from")
);
--> statement-breakpoint
ALTER TABLE "care_reminders" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
INSERT INTO "care_reminder_periods" ("reminder_id", "active_from", "active_to")
SELECT "id",
       "starts_on",
       CASE WHEN "active" THEN NULL
            ELSE GREATEST("starts_on", "updated_at"::date)
       END
FROM "care_reminders";--> statement-breakpoint
ALTER TABLE "care_reminder_periods" ADD CONSTRAINT "care_reminder_periods_reminder_id_care_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."care_reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "care_reminder_periods_start_uq" ON "care_reminder_periods" USING btree ("reminder_id","active_from");--> statement-breakpoint
CREATE INDEX "care_reminder_periods_reminder_idx" ON "care_reminder_periods" USING btree ("reminder_id","active_from");--> statement-breakpoint
CREATE INDEX "care_reminders_subject_archived_idx" ON "care_reminders" USING btree ("subject_id","archived_at");