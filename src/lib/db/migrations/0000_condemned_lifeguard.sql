CREATE TABLE "page_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"thumbnail_url" text,
	"puck_data" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"short_code" text,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_templates_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"qr_type" text NOT NULL,
	"payload" text NOT NULL,
	"payload_fields" jsonb,
	"is_dynamic" boolean DEFAULT false NOT NULL,
	"short_code" text,
	"target_url" text,
	"style_config" jsonb NOT NULL,
	"template_id" uuid,
	"is_paused" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"scan_limit" integer,
	"scan_count" integer DEFAULT 0 NOT NULL,
	"tags" text[],
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_codes_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "qr_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"thumbnail_url" text,
	"style_config" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qr_code_id" uuid NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"referrer" text,
	"device_type" text,
	"browser" text,
	"os" text,
	"country" text,
	"country_code" text,
	"region" text,
	"city" text,
	"latitude" double precision,
	"longitude" double precision,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploaded_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"storage_path" text NOT NULL,
	"public_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"avatar_url" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_auth_id_unique" UNIQUE("auth_id")
);
--> statement-breakpoint
ALTER TABLE "page_templates" ADD CONSTRAINT "page_templates_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_template_id_qr_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."qr_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_templates" ADD CONSTRAINT "qr_templates_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_page_templates_category" ON "page_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_page_templates_short_code" ON "page_templates" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX "idx_qr_codes_user_id" ON "qr_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_qr_codes_short_code" ON "qr_codes" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX "idx_qr_codes_qr_type" ON "qr_codes" USING btree ("qr_type");--> statement-breakpoint
CREATE INDEX "idx_qr_templates_category" ON "qr_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_scan_events_qr_code_id" ON "scan_events" USING btree ("qr_code_id");--> statement-breakpoint
CREATE INDEX "idx_scan_events_scanned_at" ON "scan_events" USING btree ("scanned_at");--> statement-breakpoint
CREATE INDEX "idx_scan_events_country" ON "scan_events" USING btree ("country");--> statement-breakpoint
CREATE INDEX "idx_uploaded_files_user_id" ON "uploaded_files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_profiles_auth_id" ON "user_profiles" USING btree ("auth_id");