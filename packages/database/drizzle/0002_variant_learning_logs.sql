CREATE TABLE IF NOT EXISTS "variant_learning_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_message" text NOT NULL,
  "knowledge_item_id" uuid,
  "knowledge_question_variant_id" uuid,
  "decision" varchar(20) NOT NULL,
  "suggested_question" text,
  "reason" text,
  "similarity" real,
  "source_count" integer DEFAULT 1 NOT NULL,
  "last_asked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "variant_learning_logs" ADD CONSTRAINT "variant_learning_logs_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "knowledge_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "variant_learning_logs" ADD CONSTRAINT "variant_learning_logs_knowledge_question_variant_id_knowledge_question_variants_id_fk" FOREIGN KEY ("knowledge_question_variant_id") REFERENCES "knowledge_question_variants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "idx_variant_learning_logs_created_at" ON "variant_learning_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_variant_learning_logs_decision" ON "variant_learning_logs" ("decision");
CREATE INDEX IF NOT EXISTS "idx_variant_learning_logs_knowledge_item" ON "variant_learning_logs" ("knowledge_item_id");
