ALTER TABLE "news_posts" ADD COLUMN IF NOT EXISTS "likes_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "news_posts" ADD COLUMN IF NOT EXISTS "views_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "news_posts" posts
SET "likes_count" = (
  SELECT COUNT(*)::int FROM "news_likes" likes WHERE likes."post_id" = posts."id"
)
WHERE "likes_count" = 0;
--> statement-breakpoint
UPDATE "news_posts" posts
SET "views_count" = (
  SELECT COUNT(*)::int FROM "news_views" views WHERE views."post_id" = posts."id"
)
WHERE "views_count" = 0;