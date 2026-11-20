ALTER TABLE "notification_outbox" ALTER COLUMN "incident_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ALTER COLUMN "revision" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
UPDATE "notification_outbox" AS o
SET "subject_id" = i."subject_id"
FROM "incidents" AS i
WHERE o."incident_id" = i."id" AND o."subject_id" IS NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "kind" text DEFAULT 'alert' NOT NULL;--> statement-breakpoint
UPDATE "notification_outbox" SET "kind" = 'update' WHERE "dedupe_key" LIKE '%:update';--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_outbox_subject_kind_idx" ON "notification_outbox" USING btree ("subject_id","kind");--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_kind_chk" CHECK ("notification_outbox"."kind" in ('alert', 'update', 'escalation', 'care_digest', 'care_rule'));