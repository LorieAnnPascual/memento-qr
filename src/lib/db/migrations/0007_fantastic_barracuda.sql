ALTER TABLE "qr_destination_history" ADD COLUMN "qr_type" text;--> statement-breakpoint
ALTER TABLE "qr_destination_history" ADD COLUMN "previous_qr_type" text;--> statement-breakpoint
ALTER TABLE "qr_destination_history" ADD COLUMN "payload_fields" jsonb;--> statement-breakpoint
ALTER TABLE "qr_destination_history" ADD COLUMN "previous_payload_fields" jsonb;