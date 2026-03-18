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

-- Ensure is_broadcaster column exists (added later for sync_moderators & transfer_permissions_to_roles)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_roles' AND column_name='is_broadcaster') THEN
        ALTER TABLE user_roles ADD COLUMN is_broadcaster boolean DEFAULT false;
    END IF;
END $$;

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

-- Helper Function for RLS (Security Definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_broadcaster_role()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_broadcaster = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_moderator_role()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_moderator = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_vip_role()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_vip = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "All logged-in users can view posts" ON onlybart_posts
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Broadcaster can insert posts" ON onlybart_posts FOR INSERT WITH CHECK (
  is_broadcaster_role()
);

CREATE POLICY "Broadcaster can update own posts" ON onlybart_posts FOR UPDATE USING (
  is_broadcaster_role()
);

CREATE POLICY "Broadcaster can delete own posts" ON onlybart_posts
FOR DELETE USING (is_broadcaster_role());


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

CREATE POLICY "All logged-in users can view likes" ON onlybart_likes
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "All logged-in users can insert likes, superlike nur VIP/Mod" ON onlybart_likes
FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
  AND NOT is_broadcaster_role()
  AND (
    (is_superlike = false)
    OR
    (is_superlike = true AND (is_vip_role() OR is_moderator_role()))
  )
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

CREATE POLICY "All logged-in users can view comments" ON onlybart_comments
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "All logged-in users can insert comments" ON onlybart_comments
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "User kann eigenen Kommentar löschen, Mod/Broadcaster alle" ON onlybart_comments
FOR DELETE USING (
  auth.uid() = user_id
  OR is_moderator_role()
  OR is_broadcaster_role()
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
  is_broadcaster_role()
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

-- 7b. Ausschlussliste für manuell entfernte Mods
CREATE TABLE IF NOT EXISTS mod_sync_excluded (
  twitch_user_id  text PRIMARY KEY,
  display_name    text,
  excluded_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mod_sync_excluded ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "select_mod_sync_excluded" ON mod_sync_excluded FOR SELECT USING (true);

-- 8. Enhanced Sync Function (Merges "moderators" table logic with "user_roles" logic)
CREATE OR REPLACE FUNCTION sync_moderators(p_mods jsonb, p_broadcaster_twitch_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_twitch_id   text;
  v_broadcaster_id     text;
  v_count              integer;

  -- Variables for user_roles sync
  vote_mod_record      jsonb;
  t_id                 text;
  u_id                 uuid;
  roles_synced         integer := 0;
BEGIN
  -- Broadcaster-ID aus Parameter oder aus der Liste der Mods (erste ID = Broadcaster)
  v_broadcaster_id := COALESCE(
    p_broadcaster_twitch_id,
    (p_mods->0->>'user_id')::text
  );

  -- Update legacy moderators table (for Clip Voting compatibility)
  DELETE FROM moderators WHERE is_manual = false;

  -- Mods einfügen, aber Ausschlüsse (mod_sync_excluded) überspringen.
  -- Der Broadcaster wird IMMER eingefügt, auch wenn er auf der Ausschlussliste steht.
  INSERT INTO moderators (twitch_user_id, display_name, is_broadcaster, is_manual)
  SELECT
    (m->>'user_id')::text,
    (m->>'user_name')::text,
    ((m->>'user_id')::text = v_broadcaster_id),
    false
  FROM jsonb_array_elements(p_mods) AS m
  WHERE (m->>'user_id')::text = v_broadcaster_id
     OR NOT EXISTS (SELECT 1 FROM mod_sync_excluded e WHERE e.twitch_user_id = (m->>'user_id')::text)
  ON CONFLICT (twitch_user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_broadcaster = EXCLUDED.is_broadcaster,
    is_manual = EXCLUDED.is_manual;

  -- Update user_roles table (for OnlyBart RLS)
  FOR vote_mod_record IN SELECT * FROM jsonb_array_elements(p_mods)
  LOOP
        t_id := vote_mod_record->>'user_id';

        -- Ausgeschlossene Mods überspringen (Broadcaster wird immer synced)
        IF t_id <> v_broadcaster_id AND EXISTS (SELECT 1 FROM mod_sync_excluded WHERE twitch_user_id = t_id) THEN
            CONTINUE;
        END IF;

        -- Find UUID from auth.users
        SELECT id INTO u_id FROM auth.users
        WHERE raw_user_meta_data->>'provider_id' = t_id
        OR raw_user_meta_data->>'sub' = t_id
        LIMIT 1;

        IF u_id IS NOT NULL THEN
            INSERT INTO public.user_roles (user_id, is_moderator, is_broadcaster, last_synced_at)
            VALUES (
                u_id,
                true,
                (t_id = v_broadcaster_id),
                now()
            )
            ON CONFLICT (user_id)
            DO UPDATE SET
                is_moderator = true,
                is_broadcaster = (t_id = v_broadcaster_id),
                last_synced_at = now();

            roles_synced := roles_synced + 1;
        END IF;
  END LOOP;

  SELECT count(*) INTO v_count FROM moderators;

  RETURN jsonb_build_object(
    'success', true,
    'count', v_count,
    'excluded_count', (SELECT count(*) FROM mod_sync_excluded),
    'roles_synced', roles_synced,
    'broadcaster_id', v_broadcaster_id
  );
END;
$$;

-- ── Ausschlüsse zurücksetzen ──
CREATE OR REPLACE FUNCTION reset_mod_sync_exclusions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_twitch_id text;
  v_deleted integer;
BEGIN
  SELECT coalesce(raw_user_meta_data->>'sub', raw_user_meta_data->>'provider_id')
  INTO v_caller_twitch_id FROM auth.users WHERE id = auth.uid();
  IF v_caller_twitch_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF NOT EXISTS(SELECT 1 FROM moderators WHERE twitch_user_id = v_caller_twitch_id) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  DELETE FROM mod_sync_excluded WHERE TRUE;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'cleared', v_deleted);
END;
$$;

-- ═════════════════════════════════════════════════════════
--  Rollentransfer: twitch_permissions → user_roles beim Login
-- ═════════════════════════════════════════════════════════
-- Wird vom Frontend nach jedem Login aufgerufen.
-- Liest die Twitch-ID des eingeloggten Users, sucht in
-- twitch_permissions nach VIP/Sub-Status und upserted
-- in user_roles (UUID basiert) für RLS-kompatiblen Zugriff.

CREATE OR REPLACE FUNCTION transfer_permissions_to_roles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid;
  v_twitch_id  text;
  v_is_vip     boolean := false;
  v_is_sub     boolean := false;
  v_is_mod     boolean := false;
  v_is_bc      boolean := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Twitch-ID des eingeloggten Users ermitteln
  SELECT coalesce(
    raw_user_meta_data->>'sub',
    raw_user_meta_data->>'provider_id'
  ) INTO v_twitch_id
  FROM auth.users WHERE id = v_user_id;

  IF v_twitch_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_twitch_id');
  END IF;

  -- VIP/Sub-Status aus twitch_permissions lesen
  SELECT
    coalesce(tp.is_vip, false),
    coalesce(tp.is_subscriber, false)
  INTO v_is_vip, v_is_sub
  FROM twitch_permissions tp
  WHERE tp.twitch_id = v_twitch_id;

  -- Mod/Broadcaster-Status aus moderators-Tabelle lesen (falls vorhanden)
  SELECT
    true,
    coalesce(m.is_broadcaster, false)
  INTO v_is_mod, v_is_bc
  FROM moderators m
  WHERE m.twitch_user_id = v_twitch_id;

  -- Falls weder in twitch_permissions noch in moderators gefunden
  -- und auch kein bestehender user_roles-Eintrag existiert → nichts tun
  IF NOT FOUND AND v_is_vip = false AND v_is_sub = false THEN
    -- Prüfen ob bereits ein Eintrag existiert (z.B. vom Sync)
    IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_user_id) THEN
      RETURN jsonb_build_object('success', true, 'action', 'no_permissions_found');
    END IF;
  END IF;

  -- Upsert in user_roles
  INSERT INTO user_roles (user_id, is_subscriber, is_vip, is_moderator, is_broadcaster, last_synced_at)
  VALUES (v_user_id, v_is_sub, v_is_vip, v_is_mod, v_is_bc, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    is_subscriber  = EXCLUDED.is_subscriber,
    is_vip         = EXCLUDED.is_vip,
    is_moderator   = CASE WHEN user_roles.is_moderator THEN true ELSE EXCLUDED.is_moderator END,
    is_broadcaster = CASE WHEN user_roles.is_broadcaster THEN true ELSE EXCLUDED.is_broadcaster END,
    last_synced_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'action', 'synced',
    'is_vip', v_is_vip,
    'is_subscriber', v_is_sub,
    'is_moderator', v_is_mod,
    'is_broadcaster', v_is_bc
  );
END;
$$;

