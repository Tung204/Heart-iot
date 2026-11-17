CREATE TYPE "public"."actor_kind" AS ENUM('user', 'device', 'system', 'ai');--> statement-breakpoint
CREATE TYPE "public"."ai_summary_status" AS ENUM('ready', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."alert_action" AS ENUM('acknowledge', 'resolve');--> statement-breakpoint
CREATE TYPE "public"."alert_action_outcome" AS ENUM('applied', 'conflict', 'forbidden');--> statement-breakpoint
CREATE TYPE "public"."care_link_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."config_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."incident_event_type" AS ENUM('fall.candidate', 'fall.cancelled', 'fall.confirmed', 'user.cancel_requested', 'sos.confirmed');--> statement-breakpoint
CREATE TYPE "public"."incident_state" AS ENUM('suspected', 'open', 'acknowledged', 'resolved', 'cancelled', 'unconfirmed');--> statement-breakpoint
CREATE TYPE "public"."incident_type" AS ENUM('fall', 'sos');--> statement-breakpoint
CREATE TYPE "public"."maintenance_task_status" AS ENUM('open', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('active', 'superseded', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'planning', 'waiting_input', 'waiting_approval', 'running', 'reconciling', 'stopping', 'suspended', 'succeeded', 'partially_succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('pending', 'waiting_input', 'waiting_approval', 'running', 'waiting_retry', 'suspended', 'unknown', 'succeeded', 'failed', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."view_scope" AS ENUM('user', 'subject', 'global');--> statement-breakpoint
CREATE TYPE "public"."view_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"execution_principal" text DEFAULT 'agent-runtime' NOT NULL,
	"delegation_id" uuid,
	"type" text NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"plan_version" integer DEFAULT 1 NOT NULL,
	"request_key" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"error_code" text,
	"cancel_requested_at" timestamp with time zone,
	"root_execution_id" uuid,
	"parent_run_id" uuid,
	"caused_by_event_id" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"run_id" uuid,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"status" "ai_summary_status" DEFAULT 'ready' NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"content" jsonb NOT NULL,
	"aggregate" jsonb NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" "alert_action" NOT NULL,
	"reason" text,
	"outcome" "alert_action_outcome" NOT NULL,
	"state_before" "incident_state" NOT NULL,
	"state_after" "incident_state" NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"actor_kind" "actor_kind" NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"outcome" text NOT NULL,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"caregiver_user_id" uuid NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"permissions" jsonb NOT NULL,
	"status" "care_link_status" DEFAULT 'active' NOT NULL,
	"shared_from" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"scope" jsonb NOT NULL,
	"capabilities" jsonb NOT NULL,
	"limits" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "device_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial" text NOT NULL,
	"label" text NOT NULL,
	"credential_hash" text NOT NULL,
	"claim_code_hash" text,
	"claim_code_expires_at" timestamp with time zone,
	"firmware_version" text,
	"last_seen_at" timestamp with time zone,
	"last_boot_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"event_revision" integer NOT NULL,
	"event_type" "incident_event_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"measured_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied" boolean DEFAULT false NOT NULL,
	"conflict_reason" text
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"device_incident_id" text NOT NULL,
	"type" "incident_type" NOT NULL,
	"state" "incident_state" NOT NULL,
	"last_revision" integer NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"last_event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"resolution_reason" text,
	"resolution_outcome" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"token_hash" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "maintenance_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"subject_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"status" "maintenance_task_status" DEFAULT 'open' NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"due_at" timestamp with time zone,
	"notes" text,
	"created_by_run_id" uuid,
	"dedupe_key" text NOT NULL,
	"assignee_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"version" integer NOT NULL,
	"status" "config_status" DEFAULT 'draft' NOT NULL,
	"value" jsonb NOT NULL,
	"digest" text NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realtime_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"type" text NOT NULL,
	"entity_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"capability_id" text NOT NULL,
	"status" "step_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error_code" text,
	"idempotency_key" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "step_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"device_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"boot_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"measured_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_status" text NOT NULL,
	"uptime_ms" bigint NOT NULL,
	"metrics" jsonb NOT NULL,
	"quality" jsonb NOT NULL,
	"battery_percent" integer,
	"firmware_version" text NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL,
	"is_quarantined" boolean DEFAULT false NOT NULL,
	"payload_hash" text NOT NULL,
	"source" text DEFAULT 'http' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"view_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"config" jsonb NOT NULL,
	"digest" text NOT NULL,
	"approved_by_user_id" uuid NOT NULL,
	"published_by_user_id" uuid NOT NULL,
	"status" "publication_status" DEFAULT 'active' NOT NULL,
	"previous_publication_id" uuid,
	"note" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"scope" "view_scope" NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"subject_id" uuid,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" "view_status" DEFAULT 'draft' NOT NULL,
	"draft_config" jsonb NOT NULL,
	"draft_revision" integer DEFAULT 0 NOT NULL,
	"draft_digest" text,
	"base_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_delegation_id_delegations_id_fk" FOREIGN KEY ("delegation_id") REFERENCES "public"."delegations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_actions" ADD CONSTRAINT "alert_actions_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_actions" ADD CONSTRAINT "alert_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_links" ADD CONSTRAINT "care_links_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_links" ADD CONSTRAINT "care_links_caregiver_user_id_users_id_fk" FOREIGN KEY ("caregiver_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_links" ADD CONSTRAINT "care_links_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_assignments" ADD CONSTRAINT "device_assignments_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_assignments" ADD CONSTRAINT "device_assignments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_assignments" ADD CONSTRAINT "device_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assignment_id_device_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."device_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_created_by_run_id_agent_runs_id_fk" FOREIGN KEY ("created_by_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_configs" ADD CONSTRAINT "policy_configs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_events" ADD CONSTRAINT "realtime_events_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_attempts" ADD CONSTRAINT "step_attempts_step_id_run_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."run_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_assignment_id_device_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."device_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_publications" ADD CONSTRAINT "view_publications_view_id_workspace_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."workspace_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_publications" ADD CONSTRAINT "view_publications_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_publications" ADD CONSTRAINT "view_publications_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_views" ADD CONSTRAINT "workspace_views_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_views" ADD CONSTRAINT "workspace_views_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_request_uq" ON "agent_runs" USING btree ("actor_user_id","request_key");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_actor_idx" ON "agent_runs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_summaries_subject_idx" ON "ai_summaries" USING btree ("subject_id","period_end");--> statement-breakpoint
CREATE INDEX "alert_actions_incident_idx" ON "alert_actions" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "care_links_active_uq" ON "care_links" USING btree ("subject_id","caregiver_user_id") WHERE revoked_at is null;--> statement-breakpoint
CREATE INDEX "care_links_caregiver_idx" ON "care_links" USING btree ("caregiver_user_id","status");--> statement-breakpoint
CREATE INDEX "delegations_actor_idx" ON "delegations" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_assignments_open_uq" ON "device_assignments" USING btree ("device_id") WHERE ended_at is null;--> statement-breakpoint
CREATE INDEX "device_assignments_subject_idx" ON "device_assignments" USING btree ("subject_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_serial_uq" ON "devices" USING btree ("serial");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_events_revision_uq" ON "incident_events" USING btree ("incident_id","event_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_events_message_uq" ON "incident_events" USING btree ("device_id","message_id");--> statement-breakpoint
CREATE INDEX "incident_events_received_idx" ON "incident_events" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_device_local_uq" ON "incidents" USING btree ("device_id","device_incident_id");--> statement-breakpoint
CREATE INDEX "incidents_subject_state_idx" ON "incidents" USING btree ("subject_id","state","detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_uq" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_subject_idx" ON "invitations" USING btree ("subject_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_tasks_dedupe_uq" ON "maintenance_tasks" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "maintenance_tasks_status_idx" ON "maintenance_tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_dedupe_uq" ON "notification_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_outbox_due_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_recipient_idx" ON "notification_outbox" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_configs_version_uq" ON "policy_configs" USING btree ("key","scope","version");--> statement-breakpoint
CREATE INDEX "policy_configs_active_idx" ON "policy_configs" USING btree ("key","status");--> statement-breakpoint
CREATE INDEX "realtime_subject_idx" ON "realtime_events" USING btree ("subject_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_steps_index_uq" ON "run_steps" USING btree ("run_id","step_index");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "step_attempts_uq" ON "step_attempts" USING btree ("step_id","attempt_number");--> statement-breakpoint
CREATE INDEX "subjects_owner_idx" ON "subjects" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telemetry_message_uq" ON "telemetry" USING btree ("device_id","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telemetry_sequence_uq" ON "telemetry" USING btree ("device_id","boot_id","sequence");--> statement-breakpoint
CREATE INDEX "telemetry_assignment_time_idx" ON "telemetry" USING btree ("assignment_id","measured_at");--> statement-breakpoint
CREATE INDEX "telemetry_received_idx" ON "telemetry" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_uq" ON "users" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "view_publications_revision_uq" ON "view_publications" USING btree ("view_id","revision");--> statement-breakpoint
CREATE INDEX "view_publications_view_idx" ON "view_publications" USING btree ("view_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_views_owner_key_uq" ON "workspace_views" USING btree ("owner_user_id","key");