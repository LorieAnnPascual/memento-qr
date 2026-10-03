CREATE TABLE "slug_aliases" (
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"qr_code_id" uuid,
	"page_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slug_aliases_kind_code_pk" PRIMARY KEY("kind","code")
);
--> statement-breakpoint
ALTER TABLE "slug_aliases" ADD CONSTRAINT "slug_aliases_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slug_aliases" ADD CONSTRAINT "slug_aliases_page_id_page_templates_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_slug_aliases_qr_code_id" ON "slug_aliases" USING btree ("qr_code_id");--> statement-breakpoint
CREATE INDEX "idx_slug_aliases_page_id" ON "slug_aliases" USING btree ("page_id");