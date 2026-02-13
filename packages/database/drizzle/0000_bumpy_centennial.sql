CREATE TYPE "public"."match_type" AS ENUM('contains', 'exact', 'regex');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('kakao', 'coupang', 'naver', 'cafe24', 'manual');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('new', 'answered', 'refined', 'published', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."kb_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."response_source" AS ENUM('kb_match', 'ai_generated', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_type" AS ENUM('full', 'incremental');--> statement-breakpoint
CREATE TABLE "blocked_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" varchar(500) NOT NULL,
	"match_type" "match_type" DEFAULT 'contains' NOT NULL,
	"reason" varchar(255),
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cafe24_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mall_id" varchar(100) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scopes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cafe24_tokens_mall_id_unique" UNIQUE("mall_id")
);
--> statement-breakpoint
CREATE TABLE "collector_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(50) NOT NULL,
	"sync_type" "sync_type" NOT NULL,
	"status" "sync_status" NOT NULL,
	"records_fetched" integer DEFAULT 0,
	"records_created" integer DEFAULT 0,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kakao_user_id" varchar(255) NOT NULL,
	"user_message" text NOT NULL,
	"bot_response" text NOT NULL,
	"response_source" "response_source" NOT NULL,
	"matched_kb_id" uuid,
	"similarity_score" real,
	"was_helpful" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kakao_user_id" varchar(255) NOT NULL,
	"phone_number" varchar(30),
	"cafe24_customer_id" varchar(255),
	"cafe24_member_id" varchar(255),
	"linked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_links_kakao_user_id_unique" UNIQUE("kakao_user_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"question_embedding" vector(1536),
	"category" varchar(100),
	"tags" text[],
	"source_inquiry_id" uuid,
	"image_url" varchar(1024),
	"status" "kb_status" DEFAULT 'draft' NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(255),
	"confirmed_by" varchar(255),
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "channel" NOT NULL,
	"external_id" varchar(255),
	"customer_name" varchar(255),
	"question_text" text NOT NULL,
	"answer_text" text,
	"question_embedding" vector(1536),
	"ai_category" varchar(100),
	"ai_summary" text,
	"status" "inquiry_status" DEFAULT 'new' NOT NULL,
	"knowledge_item_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"answered_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ri_channel_external" UNIQUE("channel","external_id")
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_matched_kb_id_knowledge_items_id_fk" FOREIGN KEY ("matched_kb_id") REFERENCES "public"."knowledge_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_inquiries" ADD CONSTRAINT "raw_inquiries_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conv_kakao_user" ON "conversations" USING btree ("kakao_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_conv_source" ON "conversations" USING btree ("response_source");--> statement-breakpoint
CREATE INDEX "idx_cl_phone_number" ON "customer_links" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "idx_cl_cafe24_customer_id" ON "customer_links" USING btree ("cafe24_customer_id");--> statement-breakpoint
CREATE INDEX "idx_ki_status" ON "knowledge_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ki_category" ON "knowledge_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_ri_channel_status" ON "raw_inquiries" USING btree ("channel","status");