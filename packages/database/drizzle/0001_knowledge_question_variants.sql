CREATE TABLE IF NOT EXISTS "knowledge_question_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"question" text NOT NULL,
	"question_embedding" vector(1536) NOT NULL,
	"source" varchar(50) DEFAULT 'ai_generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_question_variants"
	ADD CONSTRAINT "knowledge_question_variants_knowledge_item_id_knowledge_items_id_fk"
	FOREIGN KEY ("knowledge_item_id")
	REFERENCES "public"."knowledge_items"("id")
	ON DELETE cascade
	ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kqv_knowledge_item"
	ON "knowledge_question_variants" USING btree ("knowledge_item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_kqv_item_question"
	ON "knowledge_question_variants" USING btree ("knowledge_item_id","question");
