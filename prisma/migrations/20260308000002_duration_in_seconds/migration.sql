-- Migration: duration_in_seconds
-- Renames sessionDurationMin → sessionDurationSec and notifyBeforeMin → notifyBeforeSec
-- in guild_configs, converting stored values from minutes to seconds.
-- All column names are camelCase per project convention.

-- Step 1: Add the new columns (nullable so we can populate them before adding NOT NULL)
ALTER TABLE "guild_configs" ADD COLUMN "sessionDurationSec" INTEGER;
ALTER TABLE "guild_configs" ADD COLUMN "notifyBeforeSec" INTEGER;

-- Step 2: Populate new columns from old ones, converting minutes → seconds
UPDATE "guild_configs"
SET
  "sessionDurationSec" = "sessionDurationMin" * 60,
  "notifyBeforeSec"    = "notifyBeforeMin" * 60;

-- Step 3: Apply NOT NULL constraints with defaults now that all rows are populated
ALTER TABLE "guild_configs" ALTER COLUMN "sessionDurationSec" SET NOT NULL;
ALTER TABLE "guild_configs" ALTER COLUMN "sessionDurationSec" SET DEFAULT 3600;
ALTER TABLE "guild_configs" ALTER COLUMN "notifyBeforeSec" SET NOT NULL;
ALTER TABLE "guild_configs" ALTER COLUMN "notifyBeforeSec" SET DEFAULT 300;

-- Step 4: Drop the old columns
ALTER TABLE "guild_configs" DROP COLUMN "sessionDurationMin";
ALTER TABLE "guild_configs" DROP COLUMN "notifyBeforeMin";
