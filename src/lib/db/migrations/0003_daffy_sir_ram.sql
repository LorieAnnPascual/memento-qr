ALTER TABLE "page_templates" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "page_templates" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "page_templates" ADD COLUMN "assigned_to" uuid;--> statement-breakpoint
ALTER TABLE "page_templates" ADD COLUMN "next_action" text;--> statement-breakpoint
ALTER TABLE "page_templates" ADD COLUMN "checklist" jsonb;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "assigned_to" uuid;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "next_action" text;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "checklist" jsonb;--> statement-breakpoint
ALTER TABLE "page_templates" ADD CONSTRAINT "page_templates_updated_by_user_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_templates" ADD CONSTRAINT "page_templates_assigned_to_user_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_updated_by_user_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_assigned_to_user_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_page_templates_assigned_to" ON "page_templates" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_qr_codes_assigned_to" ON "qr_codes" USING btree ("assigned_to");