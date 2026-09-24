CREATE TABLE "qr_destination_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qr_code_id" uuid NOT NULL,
	"destination" text NOT NULL,
	"previous_destination" text,
	"changed_by" uuid,
	"restored_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_templates" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "health_status" text;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "health_message" text;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "health_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "qr_destination_history" ADD CONSTRAINT "qr_destination_history_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_destination_history" ADD CONSTRAINT "qr_destination_history_changed_by_user_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_qr_dest_history_qr_created" ON "qr_destination_history" USING btree ("qr_code_id","created_at");