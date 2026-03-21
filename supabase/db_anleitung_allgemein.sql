-- Komplette Anleitung: Rewards-System mit Supabase/Postgres
-- Tabellen anlegen, Rewards befüllen, Einlösen und Hinweise



create table if not exists rewards (
  id text primary key,
  name text not null,
  cost integer not null,
  type text not null,
  source text,
  mediaUrl text,
  showYoutubeVideo boolean,
  description text,
  customImageUrl text,
  text text,
  duration integer,
  oncePerStream boolean
);

create table if not exists redeemed_rewards (
  id uuid primary key default gen_random_uuid(),
  twitch_user_id text not null,
  reward_id text references rewards(id) on delete cascade,
  timestamp timestamptz not null default now(),
  cost integer,
  description text,
  ttsText text
);

-- 2. Rewards befüllen (aus rewards.json)
insert into rewards (
  id, name, cost, type, source, mediaUrl, showYoutubeVideo, description, customImageUrl, text, duration, oncePerStream
) values
('1', 'Zerrrrooo', 30, 'video', 'youtube', 'https://www.youtube.com/watch?v=fcGMZ3-40hQ', null, 'Spielt ein Meme von YouTube ab.', null, null, 15, null),
('2', 'Ich bin hier in Gefahr!', 100, 'video', 'youtube', 'https://www.youtube.com/watch?v=X-4pJ_6y9-0', null, 'Spielt ein Meme von YouTube ab.', null, null, 15, null),
('3', 'Ich kann nicht mehr!', 300, 'video', 'youtube', 'https://www.youtube.com/watch?v=r5sTTlph2Vk', null, 'Spielt ein Meme von YouTube ab.', null, null, 15, null),
('4', 'Australian American', 500, 'video', 'youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', null, 'Spielt ein Meme von YouTube ab.', null, null, 15, null),
('5', 'Erfahrung', 500, 'video', 'youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', null, 'Spielt ein Meme von YouTube ab.', null, null, 15, null),
('6', 'Och neeee', 500, 'video', 'youtube', 'https://www.youtube.com/watch?v=SbwCnVJ5Clk', null, 'Spielt ein Meme von YouTube ab.', null, null, 15, null),
('7', 'Otto', 500, 'video', 'youtube', 'https://www.youtube.com/watch?v=iPXakryoWYM', null, 'Spielt ein Meme von YouTube ab.', null, null, 15, null),
('8', 'Pepps', 500, 'video', 'youtube', 'https://www.youtube.com/watch?v=emdEWtsp2X0', null, 'Spielt ein Meme von YouTube ab.', null, null, 15, null),
('9', 'Technical Difficulties', 1000, 'video', 'youtube', 'https://www.youtube.com/watch?v=D7npse9n-Yw&list=RDD7npse9n-Yw&start_radio=1', null, 'Spielt ein Meme von YouTube ab.', null, null, 24, null),
('10', 'TTS Nachricht', 500, 'tts', null, null, null, 'Dies ist eine Text to Speech Nachricht.', null, null, 7, null),
('11', 'RAID-Anführer', 2500, 'tts', null, null, null, 'RAID-Anführer', null, null, 5, true),
('12', 'Oreo', 500, 'image_text', null, 'https://pngimg.com/d/oreo_PNG30.png', null, 'Snäck!', null, null, 5, null),
('13', 'Sour and Sweet + 1x Centershock', 10000, 'video', 'youtube', 'https://www.youtube.com/watch?v=4FHlp88vSuU', false, 'Stefan futtert nen Centershock', 'https://www.sweetsanddrinks.ch/temp/resize_800x800_20051_9688.png', 'Sour and Sweet + 1x Centershock', 60, null)
on conflict (id) do nothing;

create table if not exists points (
    id uuid primary key default gen_random_uuid(),
    twitch_user_id text not null,
    points integer not null default 0,
    reason text,
    timestamp text
    );

-- Ensure new reward columns exist for frontend compatibility
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rewards' AND column_name = 'namekey'
  ) THEN
    ALTER TABLE rewards ADD COLUMN nameKey text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rewards' AND column_name = 'desckey'
  ) THEN
    ALTER TABLE rewards ADD COLUMN descKey text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rewards' AND column_name = 'cooldown'
  ) THEN
    ALTER TABLE rewards ADD COLUMN cooldown integer DEFAULT 0;
  END IF;
END $$;

-- Some clients (PostgREST) may request quoted camelCase column names (e.g. "descKey").
-- Ensure quoted camelCase columns exist as well so REST calls with quoted identifiers succeed.
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "nameKey" text;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS "descKey" text;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS cooldown integer DEFAULT 0;

-- Ensure pgcrypto extension (for gen_random_uuid) exists and set default id for rewards
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  -- If rewards.id has no default, set it to a generated uuid cast to text
  IF (SELECT column_default FROM information_schema.columns WHERE table_name='rewards' AND column_name='id') IS NULL THEN
    ALTER TABLE rewards ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
  END IF;
END $$;

-- Trigger: ensure id is set even if client explicitly sends null
CREATE OR REPLACE FUNCTION public.ensure_rewards_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := gen_random_uuid()::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_rewards_id ON rewards;
CREATE TRIGGER trg_ensure_rewards_id
  BEFORE INSERT ON rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_rewards_id();

-- 1. RLS für die Tabelle aktivieren
ALTER TABLE points ENABLE ROW LEVEL SECURITY;

-- 2. Policy: Jeder darf seine EIGENEN Punkte sehen
CREATE POLICY "Nutzer können eigene Punkte sehen"
ON points
FOR SELECT
               USING (
               -- Wir vergleichen die twitch_user_id in der Tabelle
               -- mit der provider_id aus dem JWT-Token des Users
               twitch_user_id = (auth.jwt() -> 'user_metadata' ->> 'provider_id')
               );

-- Allow moderators / broadcaster (or service_role) to insert, update and delete points
-- Uses helper functions defined in supa_onlybart_setup.sql: is_moderator_role(), is_broadcaster_role()
CREATE POLICY "Moderatoren können Punkte verwalten" ON points
  FOR ALL
  USING (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR public.is_moderator_role()
    OR public.is_broadcaster_role()
  )
  WITH CHECK (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR public.is_moderator_role()
    OR public.is_broadcaster_role()
  );


-- RLS für Rewards
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broadcaster kann Rewards einfügen"
ON rewards
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_broadcaster = true
  )
);

CREATE POLICY "Broadcaster kann Rewards ändern"
ON rewards
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_broadcaster = true
  )
);

-- Allow moderators or broadcaster (or service_role) to delete rewards
CREATE POLICY "Moderatoren/Broadcaster können Rewards löschen" ON rewards
  FOR DELETE
  USING (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR public.is_moderator_role()
    OR public.is_broadcaster_role()
  );

-- RPC: admin_delete_reward(p_id text)
-- Security definer function that allows moderators or broadcaster (or service_role) to delete a reward
CREATE OR REPLACE FUNCTION public.admin_delete_reward(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- allow service_role bypass
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    DELETE FROM rewards WHERE id = p_id;
    RETURN jsonb_build_object('success', true);
  END IF;

  -- check moderator/broadcaster via helper functions
  IF NOT (public.is_moderator_role() OR public.is_broadcaster_role() OR public.is_moderator()) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  DELETE FROM rewards WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_reward(text) TO authenticated;

                                                    -- SQL für einen automatischen Bereinigungsjob mit pg_cron
-- Führt jede Minute das Löschen abgelaufener redeemed_global-Einträge aus

SELECT cron.schedule('delete_expired_redeemed_global',
                     '*/1 * * * *',
                     $$DELETE FROM redeemed_global WHERE redeemed_at < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');$$
);

-- Hinweis: pg_cron muss installiert und aktiviert sein.
-- Alternativ kann die Query auch als Supabase Edge Function ausgeführt werden.

-- Hinweise:
-- - Rewards werden in rewards.json gepflegt und mit obigem Befehl in die DB übernommen.
-- - Das Overlay erkennt automatisch, wie der Reward angezeigt/abgespielt wird.
-- - Für TTS kann der Text dynamisch über ttsText oder description gesetzt werden.
-- - Für einmalige Rewards (z.B. RAID-Anführer) sorgt das Overlay dafür, dass sie nicht automatisch gelöscht werden.
-- - Die Felder cost, timestamp etc. können optional mitgegeben werden.
-- - User-Punkte werden in der Tabelle points gepflegt (z.B. für ein Shop-System).
-- - Ein Reward-Kauf kann über eine Funktion wie buy_reward atomar umgesetzt werden (siehe separate Anleitung).
CREATE OR REPLACE FUNCTION handle_global_cooldown()
RETURNS TRIGGER AS $$
DECLARE
v_cooldown INTEGER;
BEGIN
  -- Hole den Cooldown-Wert aus der rewards Tabelle basierend auf der reward_id
SELECT cooldown INTO v_cooldown
FROM rewards
WHERE id = NEW.reward_id;

-- Prüfen, ob der Cooldown existiert und ungleich 0 ist
IF v_cooldown IS NOT NULL AND v_cooldown != 0 THEN
    INSERT INTO redeemed_global (
      reward_id,
      redeemed_at,
      redeemed_by,
      expires_at,
      is_active
    )
    VALUES (
      NEW.reward_id,
      NEW.timestamp,                               -- Übernimmt Zeitstempel der Einlösung
      NEW.twitch_user_id,                          -- Wer hat es eingelöst
      NEW.timestamp + (v_cooldown * INTERVAL '1 second'), -- Berechnet Ablaufzeitpunkt
      TRUE
    );
END IF;

RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_redeem_global_cooldown
    AFTER INSERT ON redeemed_rewards
    FOR EACH ROW
    EXECUTE FUNCTION handle_global_cooldown();