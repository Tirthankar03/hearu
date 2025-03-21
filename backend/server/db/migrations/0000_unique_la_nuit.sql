DO $$ BEGIN
 CREATE TYPE "public"."mood" AS ENUM('very bad', 'bad', 'neutral', 'good', 'very good');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"image_url" text NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audios" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"duration" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"randname" text DEFAULT md5(random()::text) NOT NULL,
	"email" text,
	"description" text,
	"tags" text[],
	"embedding" vector(768),
	"ai_description" text,
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat" (
	"id" text PRIMARY KEY NOT NULL,
	"user1_id" text NOT NULL,
	"user2_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"post_id" integer NOT NULL,
	"parent_comment_id" integer,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date,
	"section" text NOT NULL,
	"category" text NOT NULL,
	"audio_id" integer,
	"article_id" integer,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flagged_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"messages" json NOT NULL,
	"flagged_at" timestamp DEFAULT now() NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mood_assessments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"mood" "mood" NOT NULL,
	"assessed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"content" text,
	"points" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"summary" text,
	"embedding" vector(768)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comment_upvotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"comment_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "post_upvotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat" ADD CONSTRAINT "chat_user1_id_user_id_fk" FOREIGN KEY ("user1_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat" ADD CONSTRAINT "chat_user2_id_user_id_fk" FOREIGN KEY ("user2_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_audio_id_audios_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."audios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flagged_users" ADD CONSTRAINT "flagged_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mood_assessments" ADD CONSTRAINT "mood_assessments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comment_upvotes" ADD CONSTRAINT "comment_upvotes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "post_upvotes" ADD CONSTRAINT "post_upvotes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_embedding_idx" ON "user" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_tasks_user_date_idx" ON "daily_tasks" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_embedding_idx" ON "session" USING hnsw ("embedding" vector_cosine_ops);