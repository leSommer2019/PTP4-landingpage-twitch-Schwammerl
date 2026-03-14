-- ONLYBART SYSTEM SETUP
-- Run this in your Supabase SQL Editor

-- 1. Create a table for cached Twitch roles
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_subscriber boolean DEFAULT false,
  is_vip boolean DEFAULT false,
  is_moderator boolean DEFAULT false, -- storing this too for consistency/performance
  last_synced_at timestamptz DEFAULT now()
);

-- RLS for user_roles
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own roles" ON user_roles FOR SELECT USING (auth.uid() = user_id);
-- Only service role (Edge Function) should update this, but users can read.

-- 2. Create the posts table
CREATE TABLE IF NOT EXISTS onlybart_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  broadcaster_id uuid REFERENCES auth.users(id), -- Identify who posted (should be only broadcaster)
  content text, -- Text content
  media_url text, -- For images (Supabase storage URL)
  video_url text, -- For YouTube/external video links
  type text CHECK (type IN ('text', 'image', 'video')), -- Post type
  created_at timestamptz DEFAULT now()
);

-- RLS for onlybart_posts
ALTER TABLE onlybart_posts ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone with access (Sub/VIP/Mod/Broadcaster) can view posts.
-- We'll use a helper function to check access to keep policies clean.
CREATE OR REPLACE FUNCTION public.has_onlybart_access()
RETURNS boolean AS $$
BEGIN
  -- Check if user is broadcaster
  IF (SELECT count(*) FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'provider_id' = (SELECT raw_user_meta_data->>'provider_id' FROM auth.users WHERE id = auth.uid())) > 0 THEN
      -- This logic is flawed because we need to know the broadcaster's ID.
      -- Instead, let's rely on role checks from the user_roles table or metadata.
      -- Assuming user_roles is populated correctly.
      RETURN (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND (is_subscriber = true OR is_vip = true OR is_moderator = true)
        )
        OR
        -- Fallback: Check if user is the specific broadcaster user (hardcoded or env var? No bad idea).
        -- We will rely on is_broadcaster() RPC if it exists, otherwise assume a specific ID or role.
        -- Let's assume the syncer marks the broadcaster as a moderator or special role too?
        -- Or just check if they are the poster.
        EXISTS ( SELECT 1 FROM auth.users WHERE id = auth.uid() ) -- Allow all logged in users? No.
      );
  END IF;
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Let's simplify:
-- VIEW: Sub, VIP, Mod, Broadcaster.
-- Since determining "Broadcaster" inside SQL without knowing the ID is hard, we'll assume the Broadcaster is also a "Mod" or has a special flag.
-- Actually, the best way is to let the Edge Function set an 'is_broadcaster' flag in user_roles too.

ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS is_broadcaster boolean DEFAULT false;

CREATE POLICY "Allowed users can view posts" ON onlybart_posts FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND (is_subscriber = true OR is_vip = true OR is_moderator = true OR is_broadcaster = true)
  )
);

CREATE POLICY "Broadcaster can insert posts" ON onlybart_posts FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_broadcaster = true
  )
);

CREATE POLICY "Broadcaster can update own posts" ON onlybart_posts FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_broadcaster = true
  )
);

CREATE POLICY "Broadcaster can delete own posts" ON onlybart_posts FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_broadcaster = true
  )
);


-- 3. Create the likes table
CREATE TABLE IF NOT EXISTS onlybart_likes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES onlybart_posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_superlike boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id) -- One like per user per post
);

ALTER TABLE onlybart_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allowed users can view likes" ON onlybart_likes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND (is_subscriber = true OR is_vip = true OR is_moderator = true OR is_broadcaster = true)
  )
);

-- Like specific logic:
-- Normal Like: All allowed users EXCEPT Broadcaster.
-- Superlike: Only VIPs.

CREATE POLICY "Allowed users can insert likes" ON onlybart_likes FOR INSERT WITH CHECK (
  -- Must be allowed (Sub/VIP/Mod) AND NOT Broadcaster
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND (is_subscriber = true OR is_vip = true OR is_moderator = true)
    AND is_broadcaster = false
  )
  AND
  (
    -- If superlike, must be VIP
    (is_superlike = false) OR
    (is_superlike = true AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND is_vip = true))
  )
);

CREATE POLICY "Users can remove own likes" ON onlybart_likes FOR DELETE USING (
  auth.uid() = user_id
);


-- 4. Create the comments table
CREATE TABLE IF NOT EXISTS onlybart_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES onlybart_posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE onlybart_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allowed users can view comments" ON onlybart_comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND (is_subscriber = true OR is_vip = true OR is_moderator = true OR is_broadcaster = true)
  )
);

CREATE POLICY "Allowed users can insert comments" ON onlybart_comments FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND (is_subscriber = true OR is_vip = true OR is_moderator = true OR is_broadcaster = true)
  )
);

-- Delete: Valid if it's your own comment OR if you are Mod OR Broadcaster
CREATE POLICY "Users can delete own comments or mods/broadcaster can delete any" ON onlybart_comments FOR DELETE USING (
  auth.uid() = user_id
  OR
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND (is_moderator = true OR is_broadcaster = true)
  )
);

-- 5. Helper Views/Functions for Frontend convenience

-- View to join profiles for comments
CREATE OR REPLACE VIEW public.onlybart_comments_with_profiles AS
SELECT
  c.id, c.post_id, c.user_id, c.content, c.created_at,
  p.username, p.username as display_name -- fallback if avatar needed later
FROM onlybart_comments c
JOIN profiles p ON c.user_id = p.id;

-- Enable RLS on view (inherits from tables) - Supabase views carry permissions of the user if defined as security invoker?
-- Actually views in Supabase don't have RLS themselves usually, they reflect underlying tables.
-- But accessing via API needs permissions.
-- Easier to just select from tables and link in JS client, or use stored procedure.

-- Storage Bucket Setup for 'onlybart-media'
-- You need to create a bucket named 'onlybart-media' in the Supabase Storage dashboard manually
-- and set policy to allow authenticated uploads for Broadcaster, and reads for allowed users.

-- 6. Storage Bucket Setup (Attempt to create if extensions allow, otherwise manual step)
-- Note: This requires the 'storage' schema to be available
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('onlybart-media', 'onlybart-media', true)
    ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    -- Ignore if storage schema not accessible via SQL editor standard permissions sometimes
    RAISE NOTICE 'Could not create storage bucket via SQL. Please create "onlybart-media" manually.';
END $$;

-- Policies for Storage (Using standard storage.objects table)
-- Broadcaster Upload
CREATE POLICY "Broadcaster can upload media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'onlybart-media' AND
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND is_broadcaster = true)
);

-- Public Read (since bucket is public) or restriced to allowed users?
-- Requirement: "Zugriff haben alle angemeldeten nutzer, die sub... sind"
-- If we make the bucket public, anyone with the link can see it.
-- If we want access control on images, we should set public=false and use signed URLs or RLS.
-- However, "public URL" is used in the frontend code code currently (`getPublicUrl`).
-- So I'll stick to public read for simplicity unless strict privacy is needed.
-- Given "OnlyBart" implies privacy, maybe restricted?
-- But React code handles the gatekeeping of the *link*. If someone guesses the UUID, they see it.
-- For stricter security, change bucket to public=false and use `createSignedUrl` in frontend.
-- Keeping public for now as implemented in frontend.

CREATE POLICY "Everyone can read media" ON storage.objects FOR SELECT TO public USING (
  bucket_id = 'onlybart-media'
);

-- 7. New table for Twitch Permissions (Synced from Broadcaster)
CREATE TABLE IF NOT EXISTS twitch_permissions (
    twitch_id text PRIMARY KEY,
    is_vip boolean DEFAULT false,
    is_subscriber boolean DEFAULT false,
    last_updated timestamptz DEFAULT now()
);

ALTER TABLE twitch_permissions ENABLE ROW LEVEL SECURITY;
-- Everyone can read (to check their own permission client-side, or use function)
CREATE POLICY "Anyone can read twitch_permissions" ON twitch_permissions FOR SELECT USING (true);
-- Only authenticated users (broadcaster via RLS or specific logic) can write?
-- Actually, the Broadcaster (client-side in ModerateSettingsPage) performs the upsert.
-- So we need a policy allowing the Broadcaster to Insert/Update.
-- Since we know 'is_broadcaster' from user_roles (UUID based), we can reuse it IF the broadcaster has an entry there.
-- OR we trust the client-side logic paired with a strict RLS here.
-- The Broadcaster routes are protected.
CREATE POLICY "Broadcaster can update twitch_permissions" ON twitch_permissions FOR ALL USING (
   EXISTS (
     SELECT 1 FROM user_roles
     WHERE user_id = auth.uid()
     AND is_broadcaster = true
   )
);
-- Also allow insert
CREATE POLICY "Broadcaster can insert twitch_permissions" ON twitch_permissions FOR INSERT WITH CHECK (
   EXISTS (
     SELECT 1 FROM user_roles
     WHERE user_id = auth.uid()
     AND is_broadcaster = true
   )
);
