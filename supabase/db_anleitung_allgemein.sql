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

-- Hinweise:
-- - Rewards werden in rewards.json gepflegt und mit obigem Befehl in die DB übernommen.
-- - Das Overlay erkennt automatisch, wie der Reward angezeigt/abgespielt wird.
-- - Für TTS kann der Text dynamisch über ttsText oder description gesetzt werden.
-- - Für einmalige Rewards (z.B. RAID-Anführer) sorgt das Overlay dafür, dass sie nicht automatisch gelöscht werden.
-- - Die Felder cost, timestamp etc. können optional mitgegeben werden.
-- - User-Punkte werden in der Tabelle points gepflegt (z.B. für ein Shop-System).
-- - Ein Reward-Kauf kann über eine Funktion wie buy_reward atomar umgesetzt werden (siehe separate Anleitung).
