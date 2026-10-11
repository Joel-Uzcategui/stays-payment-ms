-- AlterTable
ALTER TABLE "stripe_events" ADD COLUMN "created_at" TIMESTAMPTZ(6);

UPDATE "stripe_events" SET "created_at" = "processed_at" WHERE "created_at" IS NULL;

ALTER TABLE "stripe_events" ALTER COLUMN "created_at" SET NOT NULL;

-- CreateIndex
CREATE INDEX "stripe_events_created_at_idx" ON "stripe_events"("created_at");
