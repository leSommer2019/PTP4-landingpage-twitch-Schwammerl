-- Migration: Add missing reward columns and ensure consistency
-- Adds: istts, cooldown, onceperstream (lowercase), imageurl, showmedia

-- Add missing columns if they don't exist
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "istts" boolean DEFAULT false;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "cooldown" integer DEFAULT 0;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "onceperstream" boolean DEFAULT false;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "imageurl" text;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "showmedia" boolean DEFAULT false;

-- Ensure old camelCase columns are still available for backward compatibility
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "oncePerStream" boolean;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "mediaUrl" text;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "customImageUrl" text;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "showYoutubeVideo" boolean;

-- Create a view or trigger to sync camelCase <-> lowercase versions (optional, for safety)
-- This ensures if someone updates one version, it syncs to the other
CREATE OR REPLACE FUNCTION sync_reward_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync oncePerStream -> onceperstream
  IF NEW."oncePerStream" IS DISTINCT FROM OLD."oncePerStream" THEN
    NEW.onceperstream := NEW."oncePerStream";
  END IF;

  -- Sync onceperstream -> oncePerStream
  IF NEW.onceperstream IS DISTINCT FROM OLD.onceperstream THEN
    NEW."oncePerStream" := NEW.onceperstream;
  END IF;

  -- Sync mediaUrl -> imageurl (for TTS/display purposes)
  IF NEW."mediaUrl" IS DISTINCT FROM OLD."mediaUrl" THEN
    NEW.imageurl := COALESCE(NEW."customImageUrl", NEW."mediaUrl");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_reward_columns_trigger ON rewards;
CREATE TRIGGER sync_reward_columns_trigger
BEFORE INSERT OR UPDATE ON rewards
FOR EACH ROW
EXECUTE FUNCTION sync_reward_columns();

-- End Migration

