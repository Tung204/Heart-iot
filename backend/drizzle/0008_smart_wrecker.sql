CREATE INDEX "ai_summaries_created_idx" ON "ai_summaries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_retention_idx" ON "notification_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "realtime_events_created_idx" ON "realtime_events" USING btree ("created_at");