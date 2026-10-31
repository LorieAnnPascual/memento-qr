CREATE TABLE "qr_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qr_code_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"summary" text NOT NULL,
	"changed_by" uuid,
	"restored_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qr_versions" ADD CONSTRAINT "qr_versions_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_versions" ADD CONSTRAINT "qr_versions_changed_by_user_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_qr_versions_qr_created" ON "qr_versions" USING btree ("qr_code_id","created_at");