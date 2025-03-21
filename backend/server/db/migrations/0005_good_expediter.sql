ALTER TABLE "session" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "session" DROP COLUMN IF EXISTS "expires_at";