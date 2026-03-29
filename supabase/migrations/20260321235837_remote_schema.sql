


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "clipvoting";


ALTER SCHEMA "clipvoting" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE SCHEMA IF NOT EXISTS "onlybart";


ALTER SCHEMA "onlybart" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."voting_round_status" AS ENUM (
    'pending',
    'active',
    'completed'
);


ALTER TYPE "public"."voting_round_status" OWNER TO "postgres";


CREATE TYPE "public"."voting_round_type" AS ENUM (
    'round1',
    'round2',
    'yearly'
);


ALTER TYPE "public"."voting_round_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_moderator"("p_twitch_user_id" "text", "p_display_name" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_twitch_id text;
  v_table_empty      boolean;
BEGIN
  SELECT coalesce(raw_user_meta_data->>'sub', raw_user_meta_data->>'provider_id')
  INTO v_caller_twitch_id FROM auth.users WHERE id = auth.uid();
  IF v_caller_twitch_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT NOT EXISTS(SELECT 1 FROM moderators) INTO v_table_empty;
  IF NOT v_table_empty AND NOT EXISTS(
    SELECT 1 FROM moderators WHERE twitch_user_id = v_caller_twitch_id
  ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  INSERT INTO moderators (twitch_user_id, display_name, is_manual)
  VALUES (p_twitch_user_id, p_display_name, true)
  ON CONFLICT (twitch_user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_manual = true;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."add_moderator"("p_twitch_user_id" "text", "p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_ban_account"("p_twitch_user_id" "text", "p_display_name" "text", "p_banned_by" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Ensure caller is a moderator (this uses the existing RPC/is_moderator function)
  if not is_moderator() then
    -- raise a clear error that will be sent back to the client
    perform raise_exception('forbidden: caller is not a moderator');
  end if;

  insert into public.banned_accounts (twitch_user_id, display_name, banned_by)
    values (p_twitch_user_id, p_display_name, p_banned_by)
  on conflict (twitch_user_id) do update
    set display_name = excluded.display_name,
        banned_by = excluded.banned_by,
        updated_at = now();
end;
$$;


ALTER FUNCTION "public"."admin_ban_account"("p_twitch_user_id" "text", "p_display_name" "text", "p_banned_by" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_ban_account"("p_twitch_user_id" "text", "p_display_name" "text" DEFAULT NULL::"text", "p_banned_by" "text" DEFAULT NULL::"text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  u RECORD;
BEGIN
  -- Insert or update ban record
  INSERT INTO public.banned_accounts (twitch_user_id, display_name, banned_by, reason)
  VALUES (p_twitch_user_id, p_display_name, p_banned_by, p_reason)
  ON CONFLICT (twitch_user_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, public.banned_accounts.display_name),
        banned_by = COALESCE(EXCLUDED.banned_by, public.banned_accounts.banned_by),
        reason = COALESCE(EXCLUDED.reason, public.banned_accounts.reason);

  -- Delete any sessions for matching auth.users (force sign-out)
  FOR u IN
    SELECT id FROM auth.users
    WHERE COALESCE(
      raw_user_meta_data ->> 'provider_id',
      raw_user_meta_data ->> 'sub',
      raw_user_meta_data ->> 'user_login',
      raw_user_meta_data ->> 'login'
    ) = p_twitch_user_id
  LOOP
    DELETE FROM auth.sessions WHERE user_id = u.id;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."admin_ban_account"("p_twitch_user_id" "text", "p_display_name" "text", "p_banned_by" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_reward"("p_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."admin_delete_reward"("p_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_end_round2"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_round  record;
  v_winner record;
BEGIN
  IF NOT is_moderator() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT * INTO v_round FROM clipvoting.voting_rounds
  WHERE type = 'round2' AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_round IS NULL THEN
    RETURN jsonb_build_object('error', 'no_active_round2');
  END IF;

  UPDATE clipvoting.voting_rounds SET status = 'completed' WHERE id = v_round.id;

  -- Gewinner ermitteln
  SELECT rc.clip_id INTO v_winner
  FROM round_clips rc
  LEFT JOIN (
    SELECT clip_id, count(*) AS cnt FROM votes WHERE round_id = v_round.id GROUP BY clip_id
  ) vc ON vc.clip_id = rc.clip_id
  WHERE rc.round_id = v_round.id
  ORDER BY coalesce(vc.cnt, 0) DESC, rc.clip_id
  LIMIT 1;

  IF v_winner IS NOT NULL THEN
    INSERT INTO monthly_winners (year, month, clip_id)
    VALUES (v_round.year, v_round.month, v_winner.clip_id)
    ON CONFLICT (year, month) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'winner_clip_id', v_winner.clip_id);
END;
$$;


ALTER FUNCTION "public"."admin_end_round2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_end_yearly"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_round  record;
  v_winner record;
BEGIN
  IF NOT is_moderator() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT * INTO v_round FROM clipvoting.voting_rounds
  WHERE type = 'yearly' AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF v_round IS NULL THEN
    RETURN jsonb_build_object('error', 'no_active_yearly');
  END IF;

  UPDATE clipvoting.voting_rounds SET status = 'completed' WHERE id = v_round.id;

  SELECT rc.clip_id INTO v_winner
  FROM round_clips rc
  LEFT JOIN (
    SELECT clip_id, count(*) AS cnt FROM votes WHERE round_id = v_round.id GROUP BY clip_id
  ) vc ON vc.clip_id = rc.clip_id
  WHERE rc.round_id = v_round.id
  ORDER BY coalesce(vc.cnt, 0) DESC, rc.clip_id
  LIMIT 1;

  IF v_winner IS NOT NULL THEN
    INSERT INTO yearly_winners (year, clip_id)
    VALUES (v_round.year, v_winner.clip_id)
    ON CONFLICT (year) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'winner_clip_id', v_winner.clip_id);
END;
$$;


ALTER FUNCTION "public"."admin_end_yearly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_start_round2"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_round record;
BEGIN
  IF NOT is_moderator() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT * INTO v_round FROM clipvoting.voting_rounds
  WHERE type = 'round2' AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1;

  IF v_round IS NULL THEN
    RETURN jsonb_build_object('error', 'no_pending_round2');
  END IF;

  UPDATE clipvoting.voting_rounds SET
    status = 'active',
    starts_at = now(),
    ends_at = now() + interval '24 hours'
  WHERE id = v_round.id;

  RETURN jsonb_build_object('success', true, 'round_id', v_round.id);
END;
$$;


ALTER FUNCTION "public"."admin_start_round2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_start_yearly"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_year    integer := extract(year from now())::integer;
  v_round   record;
  v_winner  record;
BEGIN
  IF NOT is_moderator() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Prüfen ob bereits existiert
  SELECT * INTO v_round FROM clipvoting.voting_rounds
  WHERE type = 'yearly' AND year = v_year LIMIT 1;
  IF v_round IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'yearly_already_exists');
  END IF;

  -- Runde erstellen
  INSERT INTO clipvoting.voting_rounds (type, status, year, starts_at, ends_at)
  VALUES ('yearly', 'active', v_year, now(), now() + interval '7 days')
  RETURNING * INTO v_round;

  -- Monatsgewinner Dez(Vorjahr) bis Nov(Jahr) einfügen
  INSERT INTO round_clips (round_id, clip_id)
  SELECT v_round.id, mw.clip_id
  FROM monthly_winners mw
  WHERE (mw.year = v_year - 1 AND mw.month = 12)
     OR (mw.year = v_year     AND mw.month <= 11)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'round_id', v_round.id);
END;
$$;


ALTER FUNCTION "public"."admin_start_yearly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_unban_account"("p_twitch_user_id_int" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Forward numeric id to text implementation
  RETURN public.admin_unban_account((p_twitch_user_id_int::text));
END;
$$;


ALTER FUNCTION "public"."admin_unban_account"("p_twitch_user_id_int" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_unban_account"("p_twitch_user_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM public.banned_accounts WHERE twitch_user_id = p_twitch_user_id;
END;
$$;


ALTER FUNCTION "public"."admin_unban_account"("p_twitch_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_unban_account"("p_twitch_user_id_uuid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Forward to text implementation
  RETURN public.admin_unban_account(p_twitch_user_id_uuid::text);
END;
$$;


ALTER FUNCTION "public"."admin_unban_account"("p_twitch_user_id_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_unban_account_json"("p_payload" json) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_id text;
BEGIN
  IF p_payload IS NULL THEN
    RETURN jsonb_build_object('error','missing_payload');
  END IF;
  v_id := coalesce((p_payload->>'p_twitch_user_id'), (p_payload->>'twitch_user_id'));
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('error','missing_twitch_user_id');
  END IF;
  RETURN public.admin_unban_account(v_id);
END;
$$;


ALTER FUNCTION "public"."admin_unban_account_json"("p_payload" json) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_unban_account_text"("p_twitch_user_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN public.admin_unban_account(p_twitch_user_id);
END;
$$;


ALTER FUNCTION "public"."admin_unban_account_text"("p_twitch_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cast_vote"("p_round_id" "uuid", "p_clip_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'clipvoting', 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_status  voting_round_status;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT status INTO v_status FROM clipvoting.voting_rounds WHERE id = p_round_id;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('error', 'round_not_found');
  END IF;
  IF v_status != 'active' THEN
    RETURN jsonb_build_object('error', 'round_not_active');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM clipvoting.round_clips
    WHERE round_id = p_round_id AND clip_id = p_clip_id
  ) THEN
    RETURN jsonb_build_object('error', 'clip_not_in_round');
  END IF;

  BEGIN
    INSERT INTO clipvoting.votes (round_id, clip_id, user_id)
    VALUES (p_round_id, p_clip_id, v_user_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'already_voted');
  END;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."cast_vote"("p_round_id" "uuid", "p_clip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_ban_before_login"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_twitch_id text;
  is_banned boolean;
BEGIN
  -- Wir holen die Twitch-ID aus den Identities des Events
  -- Supabase Auth Hooks liefern diese im JSON mit
  v_twitch_id := (event->'user_identity'->>'identity_id');

  -- Prüfen, ob diese Twitch-ID in deiner Tabelle steht
  SELECT EXISTS (
    SELECT 1 FROM public.banned_accounts 
    WHERE twitch_user_id = v_twitch_id
  ) INTO is_banned;

  IF is_banned THEN
    RAISE EXCEPTION 'Login verweigert: Dein Twitch-Account ist gesperrt.';
  END IF;

  RETURN event;
END;
$$;


ALTER FUNCTION "public"."check_ban_before_login"("event" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_all_active_redeemed_global"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE redeemed_global
  SET is_active = false
  WHERE is_active = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."deactivate_all_active_redeemed_global"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_expired_redeemed_global"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE redeemed_global
  SET is_active = false
  WHERE is_active = true
    AND expires_at IS NOT NULL
    AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."deactivate_expired_redeemed_global"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_redeemed_global_for_session"("p_session_id" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE redeemed_global
  SET is_active = false
  WHERE is_active = true
    AND stream_id = p_session_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."deactivate_redeemed_global_for_session"("p_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_rewards_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := gen_random_uuid()::text;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_rewards_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_bartclicker_leaderboard"("p_limit" integer DEFAULT 100) RETURNS TABLE("rank" bigint, "user_id" "uuid", "total_ever" numeric, "rebirth_count" integer, "last_updated" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY bs.total_ever DESC, bs.rebirth_count DESC) as rank,
    bs.user_id,
    bs.total_ever,
    bs.rebirth_count,
    bs.last_updated
  FROM bartclicker_scores bs
  WHERE bs.total_ever > 0 OR bs.rebirth_count > 0
  ORDER BY bs.total_ever DESC, bs.rebirth_count DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_bartclicker_leaderboard"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_bartclicker_leaderboard_with_names"("p_limit" integer DEFAULT 100) RETURNS TABLE("rank" bigint, "user_id" "uuid", "total_ever" numeric, "rebirth_count" integer, "last_updated" timestamp with time zone, "display_name" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY bs.total_ever DESC, bs.rebirth_count DESC) as rank,
    bs.user_id,
    bs.total_ever,
    bs.rebirth_count,
    bs.last_updated,
    COALESCE(p.username, 'Player ' || ROW_NUMBER() OVER (ORDER BY bs.total_ever DESC, bs.rebirth_count DESC)::text)::text as display_name
  FROM bartclicker_scores bs
  LEFT JOIN profiles p ON p.id = bs.user_id
  WHERE bs.total_ever > 0 OR bs.rebirth_count > 0
  ORDER BY bs.total_ever DESC, bs.rebirth_count DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."get_bartclicker_leaderboard_with_names"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_page_view_stats"("p_from" timestamp with time zone DEFAULT ("now"() - '30 days'::interval), "p_to" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total       integer;
  v_sessions    integer;
  v_per_page    jsonb;
  v_per_day     jsonb;
  v_top_referrers jsonb;
BEGIN
  IF NOT is_moderator() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Gesamt-Aufrufe
  SELECT count(*) INTO v_total
  FROM page_views WHERE viewed_at BETWEEN p_from AND p_to;

  -- Einzigartige Sessions
  SELECT count(DISTINCT session_id) INTO v_sessions
  FROM page_views WHERE viewed_at BETWEEN p_from AND p_to;

  -- Aufrufe pro Seite
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_per_page
  FROM (
    SELECT page_path, count(*) AS views
    FROM page_views WHERE viewed_at BETWEEN p_from AND p_to
    GROUP BY page_path ORDER BY views DESC LIMIT 20
  ) t;

  -- Aufrufe pro Tag
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_per_day
  FROM (
    SELECT viewed_at::date AS day, count(*) AS views
    FROM page_views WHERE viewed_at BETWEEN p_from AND p_to
    GROUP BY day ORDER BY day
  ) t;

  -- Top Referrer
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_referrers
  FROM (
    SELECT redirect_info->>'referrer' AS referrer, count(*) AS views
    FROM page_views
    WHERE viewed_at BETWEEN p_from AND p_to
      AND redirect_info->>'referrer' IS NOT NULL
    GROUP BY referrer ORDER BY views DESC LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'total_views', v_total,
    'unique_sessions', v_sessions,
    'per_page', v_per_page,
    'per_day', v_per_day,
    'top_referrers', v_top_referrers
  );
END;
$$;


ALTER FUNCTION "public"."get_page_view_stats"("p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_global_cooldown"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
                                                                                              $$;


ALTER FUNCTION "public"."handle_global_cooldown"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_onlybart_access"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."has_onlybart_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_onlybart_view_access"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND (is_subscriber = true OR is_vip = true OR is_moderator = true OR is_broadcaster = true)
  );
END;
$$;


ALTER FUNCTION "public"."has_onlybart_view_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_broadcaster"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM moderators m
    JOIN auth.users u ON u.id = auth.uid()
    WHERE m.twitch_user_id = coalesce(
      u.raw_user_meta_data->>'sub',
      u.raw_user_meta_data->>'provider_id'
    )
    AND m.is_broadcaster = true
  );
END;
$$;


ALTER FUNCTION "public"."is_broadcaster"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_broadcaster_role"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_broadcaster = true
  );
END;
$$;


ALTER FUNCTION "public"."is_broadcaster_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_moderator"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM moderators m
    JOIN auth.users u ON u.id = auth.uid()
    WHERE m.twitch_user_id = coalesce(
      u.raw_user_meta_data->>'sub',
      u.raw_user_meta_data->>'provider_id'
    )
  );
END;
$$;


ALTER FUNCTION "public"."is_moderator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_moderator_role"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_moderator = true
  );
END;
$$;


ALTER FUNCTION "public"."is_moderator_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_vip_role"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_vip = true
  );
END;
$$;


ALTER FUNCTION "public"."is_vip_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_reward"("p_twitch_user_id" "text", "p_reward_id" "text", "p_description" "text", "p_cost" integer, "p_ttstext" "text", "p_stream_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_reward jsonb;
  v_once boolean := false;
  v_cooldown int := 0;
  v_last timestamptz;
  v_redeemed_id uuid;
  v_global_id uuid;
  v_active_session uuid;
  v_meta jsonb := jsonb_build_object('description', p_description);
  v_expires timestamptz;
  v_stream_end timestamptz;
BEGIN
  -- Lade Reward als JSON, um unterschiedliche Spaltennamen tolerant zu behandeln
  SELECT to_jsonb(r.*) INTO v_reward FROM rewards r WHERE r.id = p_reward_id LIMIT 1;
  IF v_reward IS NULL THEN
    RETURN jsonb_build_object('error', 'reward_not_found');
  END IF;

  -- Bestimme once-per-stream Flag (prüfe mögliche Varianten)
  IF (v_reward ? 'onceperstream') THEN
    v_once := (v_reward->>'onceperstream')::boolean;
  ELSIF (v_reward ? 'oncePerStream') THEN
    v_once := (v_reward->>'oncePerStream')::boolean;
  ELSE
    v_once := false;
  END IF;

  -- Bestimme cooldown (in Sekunden)
  IF (v_reward ? 'cooldown') THEN
    v_cooldown := COALESCE((v_reward->>'cooldown')::int, 0);
  END IF;

  -- Prüfe once-per-stream: wenn stream_id übergeben, prüfe nur diese Session; sonst prüfe globale aktive Einträge
  -- Wenn kein stream_id übergeben wurde, versuche aktive stream_session zu verwenden
  IF p_stream_id IS NULL THEN
    SELECT id INTO v_active_session FROM stream_sessions WHERE is_active = true ORDER BY started_at DESC LIMIT 1;
    IF v_active_session IS NOT NULL THEN
      p_stream_id := v_active_session::text;
    END IF;
  END IF;

  IF v_once THEN
    -- Consider expired entries as not active
    IF p_stream_id IS NOT NULL THEN
      IF EXISTS(SELECT 1 FROM redeemed_global WHERE reward_id = p_reward_id AND stream_id = p_stream_id AND is_active = true AND (expires_at IS NULL OR expires_at > now())) THEN
        RETURN jsonb_build_object('error','once_per_stream_active');
      END IF;
    ELSE
      IF EXISTS(SELECT 1 FROM redeemed_global WHERE reward_id = p_reward_id AND is_active = true AND (expires_at IS NULL OR expires_at > now())) THEN
        RETURN jsonb_build_object('error','once_per_stream_active');
      END IF;
    END IF;
  END IF;

  -- Prüfe globalen Cooldown (letzte Einlösung in redeemed_global)
  SELECT redeemed_at INTO v_last FROM redeemed_global WHERE reward_id = p_reward_id ORDER BY redeemed_at DESC LIMIT 1;
  IF v_last IS NOT NULL AND v_cooldown > 0 THEN
    IF (now() - v_last) < (v_cooldown || ' seconds')::interval THEN
      RETURN jsonb_build_object('error','cooldown_active', 'remaining', (v_cooldown - EXTRACT(EPOCH FROM (now() - v_last)))::int);
    END IF;
  END IF;

  -- Berechne expires_at abhängig von cooldown / once-per-stream
  v_expires := NULL;
  IF v_cooldown > 0 THEN
    v_expires := now() + (v_cooldown || ' seconds')::interval;
  ELSIF v_once THEN
    IF p_stream_id IS NOT NULL THEN
      -- Wenn eine Stream-Session referenziert wird, versuchen wir, das Ende der Session als Ablaufzeit zu verwenden
      BEGIN
        SELECT ended_at INTO v_stream_end FROM stream_sessions WHERE id = p_stream_id::uuid LIMIT 1;
      EXCEPTION WHEN others THEN
        v_stream_end := NULL;
      END;
      -- Wenn ended_at bekannt ist, setze expires darauf; ist die Session noch aktiv, lasse expires NULL
      IF v_stream_end IS NOT NULL THEN
        v_expires := v_stream_end;
      ELSE
        v_expires := NULL;
      END IF;
    ELSE
      -- Kein Stream kontext: setze eine moderate TTL, damit ein einmal pro Stream-Flag nicht permanent blockiert
      v_expires := now() + interval '24 hours';
    END IF;
  END IF;

  -- Safety: never set expires more than 30 days into the future
  IF v_expires IS NOT NULL THEN
    v_expires := LEAST(v_expires, now() + interval '30 days');
  END IF;

  -- Alles okay: führe Inserts in einer Transaktion (SECURITY DEFINER erlaubt INSERT in Tabellen)
  BEGIN
    -- 1. Debitiere Punkte vom User
    UPDATE points SET points = points - p_cost WHERE twitch_user_id = p_twitch_user_id;

    -- 2. Füge Reward-Einlösung ein
    INSERT INTO redeemed_rewards (twitch_user_id, reward_id, timestamp, cost, description, ttstext)
    VALUES (p_twitch_user_id, p_reward_id, now(), p_cost, p_description, p_ttstext)
    RETURNING id INTO v_redeemed_id;

    -- 3. Registriere globale Einlösung für Cooldown/Once-Per-Stream
    INSERT INTO redeemed_global (reward_id, redeemed_by, redeemed_at, expires_at, stream_id, is_active, meta)
    VALUES (
      p_reward_id,
      p_twitch_user_id,
      now(),
      v_expires,
      p_stream_id,
      true,
      v_meta
    )
    RETURNING id INTO v_global_id;

    RETURN jsonb_build_object('success', true, 'redeemed_id', v_redeemed_id, 'global_id', v_global_id);
  EXCEPTION WHEN unique_violation THEN
    -- Race condition / unique constraint (z.B. once-per-stream unique index): gib sinnvolle Fehlermeldung
    RETURN jsonb_build_object('error','unique_violation');
  END;
END;
$$;


ALTER FUNCTION "public"."redeem_reward"("p_twitch_user_id" "text", "p_reward_id" "text", "p_description" "text", "p_cost" integer, "p_ttstext" "text", "p_stream_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_moderator"("p_twitch_user_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_twitch_id text;
BEGIN
  SELECT coalesce(raw_user_meta_data->>'sub', raw_user_meta_data->>'provider_id')
  INTO v_caller_twitch_id FROM auth.users WHERE id = auth.uid();
  IF v_caller_twitch_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF NOT EXISTS(SELECT 1 FROM moderators WHERE twitch_user_id = v_caller_twitch_id) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Sich selbst entfernen verhindern
  IF p_twitch_user_id = v_caller_twitch_id THEN
    RETURN jsonb_build_object('error', 'cannot_remove_self');
  END IF;

  -- Broadcaster kann nicht entfernt werden
  IF EXISTS(SELECT 1 FROM moderators WHERE twitch_user_id = p_twitch_user_id AND is_broadcaster = true) THEN
    RETURN jsonb_build_object('error', 'cannot_remove_broadcaster');
  END IF;

  -- In die Ausschlussliste eintragen, damit der Mod beim nächsten Sync nicht erneut hinzugefügt wird
  INSERT INTO mod_sync_excluded (twitch_user_id, display_name)
  SELECT twitch_user_id, display_name FROM moderators WHERE twitch_user_id = p_twitch_user_id
  ON CONFLICT (twitch_user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    excluded_at = now();

  DELETE FROM moderators WHERE twitch_user_id = p_twitch_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."remove_moderator"("p_twitch_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_mod_sync_exclusions"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."reset_mod_sync_exclusions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_moderators"("p_mods" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_twitch_id text;
  v_table_empty      boolean;
  v_count            integer;
BEGIN
  -- Twitch-ID des Aufrufers ermitteln
  SELECT coalesce(
    raw_user_meta_data->>'sub',
    raw_user_meta_data->>'provider_id'
  ) INTO v_caller_twitch_id
  FROM auth.users WHERE id = auth.uid();

  IF v_caller_twitch_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Prüfen: Tabelle leer (Bootstrap) oder Aufrufer ist Moderator?
  SELECT NOT EXISTS(SELECT 1 FROM moderators) INTO v_table_empty;
  IF NOT v_table_empty AND NOT EXISTS(
    SELECT 1 FROM moderators WHERE twitch_user_id = v_caller_twitch_id
  ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Alle bisherigen Einträge entfernen und neu befüllen
  DELETE FROM moderators;

  INSERT INTO moderators (twitch_user_id, display_name)
  SELECT (m->>'user_id')::text, (m->>'user_name')::text
  FROM jsonb_array_elements(p_mods) AS m
  ON CONFLICT (twitch_user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

  SELECT count(*) INTO v_count FROM moderators;
  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;


ALTER FUNCTION "public"."sync_moderators"("p_mods" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_moderators"("p_mods" "jsonb", "p_broadcaster_twitch_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_twitch_id   text;
  v_table_empty        boolean;
  v_count              integer;
  v_is_broadcaster     boolean;
  v_is_moderator       boolean;
  v_broadcaster_id     text;
BEGIN
  -- Service-Role-Bypass für Backend-Sync
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    -- Backend darf immer synchronisieren
    v_is_broadcaster := true;
    v_is_moderator := true;
  END IF;
  -- Twitch-ID des Aufrufers ermitteln
  SELECT coalesce(
    raw_user_meta_data->>'sub',
    raw_user_meta_data->>'provider_id'
  ) INTO v_caller_twitch_id
  FROM auth.users WHERE id = auth.uid();

  IF v_caller_twitch_id IS NULL AND current_setting('request.jwt.claim.role', true) != 'service_role' THEN
    RETURN jsonb_build_object('error', 'not_authenticated', 'message', 'Benutzer nicht authentifiziert.');
  END IF;

  -- Broadcaster-ID aus Parameter oder aus der Liste der Mods (erste ID = Broadcaster)
  v_broadcaster_id := COALESCE(
    p_broadcaster_twitch_id,
    (p_mods->0->>'user_id')::text
  );

  -- Prüfen: Ist der Aufrufer der Broadcaster?
  v_is_broadcaster := (v_caller_twitch_id = v_broadcaster_id);

  -- Prüfen: Ist der Aufrufer ein Moderator?
  SELECT EXISTS(
    SELECT 1 FROM moderators WHERE twitch_user_id = v_caller_twitch_id
  ) INTO v_is_moderator;

  -- Entscheidungslogik:
  -- Jeder authentifizierte User darf synchronisieren
  SELECT NOT EXISTS(SELECT 1 FROM moderators) INTO v_table_empty;


  -- Alle bisherigen Einträge entfernen, die NICHT manuell hinzugefügt wurden
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

  SELECT count(*) INTO v_count FROM moderators;
  RETURN jsonb_build_object(
    'success', true,
    'count', v_count,
    'excluded_count', (SELECT count(*) FROM mod_sync_excluded),
    'broadcaster_id', v_broadcaster_id,
    'caller_is_broadcaster', v_is_broadcaster
  );
END;
$$;


ALTER FUNCTION "public"."sync_moderators"("p_mods" "jsonb", "p_broadcaster_twitch_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_reward_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."sync_reward_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_permissions_to_roles"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."transfer_permissions_to_roles"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "clipvoting"."clips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "twitch_clip_id" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "creator_name" "text" DEFAULT ''::"text" NOT NULL,
    "thumbnail_url" "text",
    "embed_url" "text" NOT NULL,
    "clip_url" "text",
    "view_count" integer DEFAULT 0,
    "duration" real DEFAULT 0,
    "twitch_created_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "clipvoting"."clips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "clipvoting"."round_clips" (
    "round_id" "uuid" NOT NULL,
    "clip_id" "uuid" NOT NULL
);


ALTER TABLE "clipvoting"."round_clips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "clipvoting"."votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "clip_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "clipvoting"."votes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "clipvoting"."clip_vote_counts" AS
 SELECT "rc"."round_id",
    "rc"."clip_id",
    "c"."twitch_clip_id",
    "c"."title",
    "c"."creator_name",
    "c"."thumbnail_url",
    "c"."embed_url",
    "c"."clip_url",
    "c"."view_count",
    "c"."duration",
    "c"."twitch_created_at",
    COALESCE("vc"."cnt", 0) AS "vote_count"
   FROM (("clipvoting"."round_clips" "rc"
     JOIN "clipvoting"."clips" "c" ON (("c"."id" = "rc"."clip_id")))
     LEFT JOIN ( SELECT "votes"."round_id",
            "votes"."clip_id",
            ("count"(*))::integer AS "cnt"
           FROM "clipvoting"."votes"
          GROUP BY "votes"."round_id", "votes"."clip_id") "vc" ON ((("vc"."round_id" = "rc"."round_id") AND ("vc"."clip_id" = "rc"."clip_id"))));


ALTER VIEW "clipvoting"."clip_vote_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "clipvoting"."monthly_winners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "clip_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "clipvoting"."monthly_winners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "clipvoting"."voting_rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "public"."voting_round_type" NOT NULL,
    "status" "public"."voting_round_status" DEFAULT 'pending'::"public"."voting_round_status" NOT NULL,
    "year" integer NOT NULL,
    "month" integer,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "clipvoting"."voting_rounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "clipvoting"."yearly_winners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer NOT NULL,
    "clip_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "clipvoting"."yearly_winners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "onlybart"."onlybart_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid",
    "user_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "onlybart"."onlybart_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "onlybart"."onlybart_comments_with_profiles" WITH ("security_invoker"='on') AS
 SELECT "c"."id",
    "c"."post_id",
    "c"."user_id",
    "c"."content",
    "c"."created_at",
    "p"."username",
    "p"."username" AS "display_name"
   FROM ("onlybart"."onlybart_comments" "c"
     JOIN "public"."profiles" "p" ON (("c"."user_id" = "p"."id")));


ALTER VIEW "onlybart"."onlybart_comments_with_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "onlybart"."onlybart_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid",
    "user_id" "uuid",
    "is_superlike" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "onlybart"."onlybart_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "onlybart"."onlybart_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "broadcaster_id" "uuid",
    "content" "text",
    "media_url" "text",
    "video_url" "text",
    "type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "onlybart_posts_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'image'::"text", 'video'::"text"])))
);


ALTER TABLE "onlybart"."onlybart_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."banned_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "twitch_user_id" "text" NOT NULL,
    "display_name" "text",
    "banned_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."banned_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bartclicker_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "energy" numeric DEFAULT 0,
    "total_ever" numeric DEFAULT 0,
    "rebirth_count" integer DEFAULT 0,
    "rebirth_multiplier" numeric DEFAULT 1,
    "shop_items" "jsonb" DEFAULT '[]'::"jsonb",
    "active_buffs" "jsonb" DEFAULT '[]'::"jsonb",
    "active_debuffs" "jsonb" DEFAULT '[]'::"jsonb",
    "relics" "jsonb" DEFAULT '[]'::"jsonb",
    "offline_earning_upgrades" integer DEFAULT 0,
    "auto_click_buyer_enabled" boolean DEFAULT false,
    "click_upgrade_buyer_enabled" boolean DEFAULT false,
    "auto_click_buyer_items" "jsonb" DEFAULT '[]'::"jsonb",
    "click_upgrade_buyer_items" "jsonb" DEFAULT '[]'::"jsonb",
    "last_updated" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bartclicker_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mod_sync_excluded" (
    "twitch_user_id" "text" NOT NULL,
    "display_name" "text",
    "excluded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mod_sync_excluded" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moderators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "twitch_user_id" "text" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_broadcaster" boolean DEFAULT false,
    "is_manual" boolean DEFAULT true
);


ALTER TABLE "public"."moderators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_views" (
    "id" bigint NOT NULL,
    "session_id" "text" NOT NULL,
    "page_path" "text" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "redirect_info" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."page_views" OWNER TO "postgres";


ALTER TABLE "public"."page_views" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."page_views_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "twitch_user_id" "text" NOT NULL,
    "points" integer DEFAULT 0 NOT NULL,
    "reason" "text",
    "timestamp" "text"
);


ALTER TABLE "public"."points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."redeemed_global" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reward_id" "text" NOT NULL,
    "redeemed_by" "text",
    "redeemed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "stream_id" "text",
    "is_active" boolean DEFAULT true,
    "meta" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."redeemed_global" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."redeemed_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "twitch_user_id" "text" NOT NULL,
    "reward_id" "text",
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cost" integer,
    "description" "text",
    "ttstext" "text"
);


ALTER TABLE "public"."redeemed_rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rewards" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "name" "text" NOT NULL,
    "cost" integer NOT NULL,
    "mediaurl" "text",
    "showmedia" boolean,
    "description" "text",
    "imageurl" "text",
    "text" "text",
    "duration" integer,
    "onceperstream" boolean DEFAULT false,
    "cooldown" integer DEFAULT 0,
    "istts" boolean DEFAULT false,
    "namekey" "text",
    "desckey" "text",
    "nameKey" "text",
    "descKey" "text",
    "oncePerStream" boolean,
    "mediaUrl" "text",
    "customImageUrl" "text",
    "showYoutubeVideo" boolean
);


ALTER TABLE "public"."rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stream_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stream_identifier" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."stream_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."twitch_permissions" (
    "twitch_id" "text" NOT NULL,
    "is_vip" boolean DEFAULT false,
    "is_subscriber" boolean DEFAULT false,
    "last_updated" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."twitch_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "is_subscriber" boolean DEFAULT false,
    "is_vip" boolean DEFAULT false,
    "is_moderator" boolean DEFAULT false,
    "last_synced_at" timestamp with time zone DEFAULT "now"(),
    "is_broadcaster" boolean DEFAULT false
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "clipvoting"."clips"
    ADD CONSTRAINT "clips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "clipvoting"."clips"
    ADD CONSTRAINT "clips_twitch_clip_id_key" UNIQUE ("twitch_clip_id");



ALTER TABLE ONLY "clipvoting"."monthly_winners"
    ADD CONSTRAINT "monthly_winners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "clipvoting"."monthly_winners"
    ADD CONSTRAINT "monthly_winners_unique" UNIQUE ("year", "month");



ALTER TABLE ONLY "clipvoting"."round_clips"
    ADD CONSTRAINT "round_clips_pkey" PRIMARY KEY ("round_id", "clip_id");



ALTER TABLE ONLY "clipvoting"."votes"
    ADD CONSTRAINT "votes_one_per_user_per_round" UNIQUE ("round_id", "user_id");



ALTER TABLE ONLY "clipvoting"."votes"
    ADD CONSTRAINT "votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "clipvoting"."voting_rounds"
    ADD CONSTRAINT "voting_rounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "clipvoting"."yearly_winners"
    ADD CONSTRAINT "yearly_winners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "clipvoting"."yearly_winners"
    ADD CONSTRAINT "yearly_winners_year_key" UNIQUE ("year");



ALTER TABLE ONLY "onlybart"."onlybart_comments"
    ADD CONSTRAINT "onlybart_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "onlybart"."onlybart_likes"
    ADD CONSTRAINT "onlybart_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "onlybart"."onlybart_likes"
    ADD CONSTRAINT "onlybart_likes_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "onlybart"."onlybart_posts"
    ADD CONSTRAINT "onlybart_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banned_accounts"
    ADD CONSTRAINT "banned_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banned_accounts"
    ADD CONSTRAINT "banned_accounts_twitch_user_id_key" UNIQUE ("twitch_user_id");



ALTER TABLE ONLY "public"."bartclicker_scores"
    ADD CONSTRAINT "bartclicker_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mod_sync_excluded"
    ADD CONSTRAINT "mod_sync_excluded_pkey" PRIMARY KEY ("twitch_user_id");



ALTER TABLE ONLY "public"."moderators"
    ADD CONSTRAINT "moderators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moderators"
    ADD CONSTRAINT "moderators_twitch_user_id_key" UNIQUE ("twitch_user_id");



ALTER TABLE ONLY "public"."page_views"
    ADD CONSTRAINT "page_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."points"
    ADD CONSTRAINT "points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."redeemed_global"
    ADD CONSTRAINT "redeemed_global_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."redeemed_rewards"
    ADD CONSTRAINT "redeemed_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rewards"
    ADD CONSTRAINT "rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stream_sessions"
    ADD CONSTRAINT "stream_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stream_sessions"
    ADD CONSTRAINT "stream_sessions_stream_identifier_key" UNIQUE ("stream_identifier");



ALTER TABLE ONLY "public"."twitch_permissions"
    ADD CONSTRAINT "twitch_permissions_pkey" PRIMARY KEY ("twitch_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "idx_bartclicker_total_ever" ON "public"."bartclicker_scores" USING "btree" ("total_ever" DESC);



CREATE INDEX "idx_bartclicker_user_id" ON "public"."bartclicker_scores" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_bartclicker_user_unique" ON "public"."bartclicker_scores" USING "btree" ("user_id");



CREATE INDEX "idx_page_views_path" ON "public"."page_views" USING "btree" ("page_path");



CREATE INDEX "idx_page_views_viewed_at" ON "public"."page_views" USING "btree" ("viewed_at");



CREATE INDEX "idx_redeemed_global_reward_active" ON "public"."redeemed_global" USING "btree" ("reward_id", "is_active");



CREATE INDEX "idx_redeemed_global_reward_id" ON "public"."redeemed_global" USING "btree" ("reward_id");



CREATE INDEX "idx_redeemed_global_reward_stream" ON "public"."redeemed_global" USING "btree" ("reward_id", "stream_id");



CREATE UNIQUE INDEX "idx_reward_stream_active_unique" ON "public"."redeemed_global" USING "btree" ("reward_id", "stream_id") WHERE (("is_active" = true) AND ("stream_id" IS NOT NULL));



CREATE OR REPLACE TRIGGER "sync_reward_columns_trigger" BEFORE INSERT OR UPDATE ON "public"."rewards" FOR EACH ROW EXECUTE FUNCTION "public"."sync_reward_columns"();



CREATE OR REPLACE TRIGGER "trg_ensure_rewards_id" BEFORE INSERT ON "public"."rewards" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_rewards_id"();



CREATE OR REPLACE TRIGGER "trigger_redeem_global_cooldown" AFTER INSERT ON "public"."redeemed_rewards" FOR EACH ROW EXECUTE FUNCTION "public"."handle_global_cooldown"();



ALTER TABLE ONLY "clipvoting"."monthly_winners"
    ADD CONSTRAINT "monthly_winners_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "clipvoting"."clips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "clipvoting"."round_clips"
    ADD CONSTRAINT "round_clips_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "clipvoting"."clips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "clipvoting"."round_clips"
    ADD CONSTRAINT "round_clips_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "clipvoting"."voting_rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "clipvoting"."votes"
    ADD CONSTRAINT "votes_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "clipvoting"."clips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "clipvoting"."votes"
    ADD CONSTRAINT "votes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "clipvoting"."voting_rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "clipvoting"."votes"
    ADD CONSTRAINT "votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "clipvoting"."yearly_winners"
    ADD CONSTRAINT "yearly_winners_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "clipvoting"."clips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "onlybart"."onlybart_comments"
    ADD CONSTRAINT "onlybart_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "onlybart"."onlybart_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "onlybart"."onlybart_comments"
    ADD CONSTRAINT "onlybart_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "onlybart"."onlybart_likes"
    ADD CONSTRAINT "onlybart_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "onlybart"."onlybart_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "onlybart"."onlybart_likes"
    ADD CONSTRAINT "onlybart_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "onlybart"."onlybart_posts"
    ADD CONSTRAINT "onlybart_posts_broadcaster_id_fkey" FOREIGN KEY ("broadcaster_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bartclicker_scores"
    ADD CONSTRAINT "bartclicker_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."redeemed_global"
    ADD CONSTRAINT "redeemed_global_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."redeemed_rewards"
    ADD CONSTRAINT "redeemed_rewards_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "clipvoting"."clips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "clipvoting"."monthly_winners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "clipvoting"."round_clips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select" ON "clipvoting"."clips" FOR SELECT USING (true);



CREATE POLICY "select" ON "clipvoting"."monthly_winners" FOR SELECT USING (true);



CREATE POLICY "select" ON "clipvoting"."round_clips" FOR SELECT USING (true);



CREATE POLICY "select" ON "clipvoting"."votes" FOR SELECT USING (true);



CREATE POLICY "select" ON "clipvoting"."voting_rounds" FOR SELECT USING (true);



CREATE POLICY "select" ON "clipvoting"."yearly_winners" FOR SELECT USING (true);



ALTER TABLE "clipvoting"."votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "clipvoting"."voting_rounds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "clipvoting"."yearly_winners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "All logged-in users can insert comments" ON "onlybart"."onlybart_comments" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All logged-in users can insert likes, superlike nur VIP/Mod" ON "onlybart"."onlybart_likes" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND (NOT "public"."is_broadcaster_role"()) AND (("is_superlike" = false) OR (("is_superlike" = true) AND ("public"."is_vip_role"() OR "public"."is_moderator_role"())))));



CREATE POLICY "All logged-in users can view comments" ON "onlybart"."onlybart_comments" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All logged-in users can view likes" ON "onlybart"."onlybart_likes" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All logged-in users can view posts" ON "onlybart"."onlybart_posts" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Broadcaster can delete own posts" ON "onlybart"."onlybart_posts" FOR DELETE USING ("public"."is_broadcaster_role"());



CREATE POLICY "Broadcaster can insert posts" ON "onlybart"."onlybart_posts" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_broadcaster" = true)))));



CREATE POLICY "Broadcaster can update own posts" ON "onlybart"."onlybart_posts" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_broadcaster" = true)))));



CREATE POLICY "User kann eigenen Kommentar löschen, Mod/Broadcaster alle" ON "onlybart"."onlybart_comments" FOR DELETE USING ((("auth"."uid"() = "user_id") OR "public"."is_moderator_role"() OR "public"."is_broadcaster_role"()));



CREATE POLICY "Users can remove own likes" ON "onlybart"."onlybart_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "onlybart"."onlybart_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "onlybart"."onlybart_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "onlybart"."onlybart_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Allow select for authenticated users" ON "public"."rewards" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Anyone can read twitch_permissions" ON "public"."twitch_permissions" FOR SELECT USING (true);



CREATE POLICY "Broadcaster can insert twitch_permissions" ON "public"."twitch_permissions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_broadcaster" = true)))));



CREATE POLICY "Broadcaster can update twitch_permissions" ON "public"."twitch_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_broadcaster" = true)))));



CREATE POLICY "Broadcaster kann Rewards einfügen" ON "public"."rewards" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_broadcaster" = true)))));



CREATE POLICY "Broadcaster kann Rewards ändern" ON "public"."rewards" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."is_broadcaster" = true)))));



CREATE POLICY "Check Twitch Ban" ON "public"."moderators" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."banned_accounts"
  WHERE ("banned_accounts"."twitch_user_id" = (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'provider_id'::"text"))))));



CREATE POLICY "Check Twitch Ban" ON "public"."points" USING ((NOT (EXISTS ( SELECT 1
   FROM "public"."banned_accounts"
  WHERE ("banned_accounts"."twitch_user_id" = (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'provider_id'::"text"))))));



CREATE POLICY "Moderatoren können Punkte verwalten" ON "public"."points" USING ((("current_setting"('request.jwt.claim.role'::"text", true) = 'service_role'::"text") OR "public"."is_moderator_role"() OR "public"."is_broadcaster_role"())) WITH CHECK ((("current_setting"('request.jwt.claim.role'::"text", true) = 'service_role'::"text") OR "public"."is_moderator_role"() OR "public"."is_broadcaster_role"()));



CREATE POLICY "Moderatoren/Broadcaster können Rewards löschen" ON "public"."rewards" FOR DELETE USING ((("current_setting"('request.jwt.claim.role'::"text", true) = 'service_role'::"text") OR "public"."is_moderator_role"() OR "public"."is_broadcaster_role"()));



CREATE POLICY "Nutzer können eigene Punkte sehen" ON "public"."points" FOR SELECT USING (("twitch_user_id" = (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'provider_id'::"text")));



CREATE POLICY "Profiles are public" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own redeemed rewards" ON "public"."redeemed_rewards" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can read own roles" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."banned_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bartclicker_scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delete_banned" ON "public"."banned_accounts" FOR DELETE USING ("public"."is_broadcaster"());



CREATE POLICY "delete_mod_sync_excluded" ON "public"."mod_sync_excluded" FOR DELETE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "delete_moderator" ON "public"."bartclicker_scores" FOR DELETE USING ("public"."is_moderator"());



CREATE POLICY "insert_anon" ON "public"."page_views" FOR INSERT WITH CHECK (true);



CREATE POLICY "insert_banned" ON "public"."banned_accounts" FOR INSERT WITH CHECK ("public"."is_broadcaster"());



CREATE POLICY "insert_self" ON "public"."bartclicker_scores" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."mod_sync_excluded" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moderators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."points" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."redeemed_global" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."redeemed_rewards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rewards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select" ON "public"."moderators" FOR SELECT USING (true);



CREATE POLICY "select_banned" ON "public"."banned_accounts" FOR SELECT USING ("public"."is_moderator"());



CREATE POLICY "select_mod" ON "public"."page_views" FOR SELECT USING ("public"."is_moderator"());



CREATE POLICY "select_mod_sync_excluded" ON "public"."mod_sync_excluded" FOR SELECT USING (true);



CREATE POLICY "select_own_ban" ON "public"."banned_accounts" FOR SELECT USING ((("twitch_user_id" = ((("auth"."jwt"())::json -> 'user_metadata'::"text") ->> 'provider_id'::"text")) OR "public"."is_moderator"()));



CREATE POLICY "select_public" ON "public"."bartclicker_scores" FOR SELECT USING (true);



ALTER TABLE "public"."stream_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."twitch_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update_self" ON "public"."bartclicker_scores" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "clipvoting" TO "anon";
GRANT USAGE ON SCHEMA "clipvoting" TO "authenticated";
GRANT USAGE ON SCHEMA "clipvoting" TO "service_role";






GRANT USAGE ON SCHEMA "onlybart" TO "anon";
GRANT USAGE ON SCHEMA "onlybart" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."add_moderator"("p_twitch_user_id" "text", "p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_moderator"("p_twitch_user_id" "text", "p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_moderator"("p_twitch_user_id" "text", "p_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_ban_account"("p_twitch_user_id" "text", "p_display_name" "text", "p_banned_by" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_ban_account"("p_twitch_user_id" "text", "p_display_name" "text", "p_banned_by" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_ban_account"("p_twitch_user_id" "text", "p_display_name" "text", "p_banned_by" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_ban_account"("p_twitch_user_id" "text", "p_display_name" "text", "p_banned_by" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_ban_account"("p_twitch_user_id" "text", "p_display_name" "text", "p_banned_by" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_ban_account"("p_twitch_user_id" "text", "p_display_name" "text", "p_banned_by" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_reward"("p_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_reward"("p_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_reward"("p_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_end_round2"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_end_round2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_end_round2"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_end_yearly"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_end_yearly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_end_yearly"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_start_round2"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_start_round2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_start_round2"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_start_yearly"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_start_yearly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_start_yearly"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_unban_account"("p_twitch_user_id_int" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_unban_account"("p_twitch_user_id_int" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_unban_account"("p_twitch_user_id_int" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_unban_account"("p_twitch_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_unban_account"("p_twitch_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_unban_account"("p_twitch_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_unban_account"("p_twitch_user_id_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_unban_account"("p_twitch_user_id_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_unban_account"("p_twitch_user_id_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_unban_account_json"("p_payload" json) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_unban_account_json"("p_payload" json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_unban_account_json"("p_payload" json) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_unban_account_text"("p_twitch_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_unban_account_text"("p_twitch_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_unban_account_text"("p_twitch_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cast_vote"("p_round_id" "uuid", "p_clip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cast_vote"("p_round_id" "uuid", "p_clip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cast_vote"("p_round_id" "uuid", "p_clip_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_ban_before_login"("event" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."check_ban_before_login"("event" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_ban_before_login"("event" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."deactivate_all_active_redeemed_global"() TO "anon";
GRANT ALL ON FUNCTION "public"."deactivate_all_active_redeemed_global"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_all_active_redeemed_global"() TO "service_role";



GRANT ALL ON FUNCTION "public"."deactivate_expired_redeemed_global"() TO "anon";
GRANT ALL ON FUNCTION "public"."deactivate_expired_redeemed_global"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_expired_redeemed_global"() TO "service_role";



GRANT ALL ON FUNCTION "public"."deactivate_redeemed_global_for_session"("p_session_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."deactivate_redeemed_global_for_session"("p_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_redeemed_global_for_session"("p_session_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_rewards_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_rewards_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_rewards_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_bartclicker_leaderboard"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_bartclicker_leaderboard"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_bartclicker_leaderboard"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_bartclicker_leaderboard_with_names"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_bartclicker_leaderboard_with_names"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_bartclicker_leaderboard_with_names"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_page_view_stats"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_page_view_stats"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_page_view_stats"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_global_cooldown"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_global_cooldown"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_global_cooldown"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_onlybart_access"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_onlybart_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_onlybart_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_onlybart_view_access"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_onlybart_view_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_onlybart_view_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_broadcaster"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_broadcaster"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_broadcaster"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_broadcaster_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_broadcaster_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_broadcaster_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_moderator"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_moderator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_moderator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_moderator_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_moderator_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_moderator_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_vip_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_vip_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_vip_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_reward"("p_twitch_user_id" "text", "p_reward_id" "text", "p_description" "text", "p_cost" integer, "p_ttstext" "text", "p_stream_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_reward"("p_twitch_user_id" "text", "p_reward_id" "text", "p_description" "text", "p_cost" integer, "p_ttstext" "text", "p_stream_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_reward"("p_twitch_user_id" "text", "p_reward_id" "text", "p_description" "text", "p_cost" integer, "p_ttstext" "text", "p_stream_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_moderator"("p_twitch_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_moderator"("p_twitch_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_moderator"("p_twitch_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_mod_sync_exclusions"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_mod_sync_exclusions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_mod_sync_exclusions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_moderators"("p_mods" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_moderators"("p_mods" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_moderators"("p_mods" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_moderators"("p_mods" "jsonb", "p_broadcaster_twitch_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_moderators"("p_mods" "jsonb", "p_broadcaster_twitch_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_moderators"("p_mods" "jsonb", "p_broadcaster_twitch_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_reward_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_reward_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_reward_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_permissions_to_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_permissions_to_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_permissions_to_roles"() TO "service_role";












GRANT ALL ON TABLE "clipvoting"."clips" TO "anon";
GRANT ALL ON TABLE "clipvoting"."clips" TO "authenticated";
GRANT ALL ON TABLE "clipvoting"."clips" TO "service_role";



GRANT ALL ON TABLE "clipvoting"."round_clips" TO "anon";
GRANT ALL ON TABLE "clipvoting"."round_clips" TO "authenticated";
GRANT ALL ON TABLE "clipvoting"."round_clips" TO "service_role";



GRANT ALL ON TABLE "clipvoting"."votes" TO "anon";
GRANT ALL ON TABLE "clipvoting"."votes" TO "authenticated";
GRANT ALL ON TABLE "clipvoting"."votes" TO "service_role";



GRANT ALL ON TABLE "clipvoting"."clip_vote_counts" TO "anon";
GRANT ALL ON TABLE "clipvoting"."clip_vote_counts" TO "authenticated";
GRANT ALL ON TABLE "clipvoting"."clip_vote_counts" TO "service_role";



GRANT ALL ON TABLE "clipvoting"."monthly_winners" TO "anon";
GRANT ALL ON TABLE "clipvoting"."monthly_winners" TO "authenticated";
GRANT ALL ON TABLE "clipvoting"."monthly_winners" TO "service_role";



GRANT ALL ON TABLE "clipvoting"."voting_rounds" TO "anon";
GRANT ALL ON TABLE "clipvoting"."voting_rounds" TO "authenticated";
GRANT ALL ON TABLE "clipvoting"."voting_rounds" TO "service_role";



GRANT ALL ON TABLE "clipvoting"."yearly_winners" TO "anon";
GRANT ALL ON TABLE "clipvoting"."yearly_winners" TO "authenticated";
GRANT ALL ON TABLE "clipvoting"."yearly_winners" TO "service_role";















GRANT ALL ON TABLE "onlybart"."onlybart_comments" TO "anon";
GRANT ALL ON TABLE "onlybart"."onlybart_comments" TO "authenticated";
GRANT ALL ON TABLE "onlybart"."onlybart_comments" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "onlybart"."onlybart_comments_with_profiles" TO "anon";
GRANT ALL ON TABLE "onlybart"."onlybart_comments_with_profiles" TO "authenticated";
GRANT ALL ON TABLE "onlybart"."onlybart_comments_with_profiles" TO "service_role";



GRANT ALL ON TABLE "onlybart"."onlybart_likes" TO "anon";
GRANT ALL ON TABLE "onlybart"."onlybart_likes" TO "authenticated";
GRANT ALL ON TABLE "onlybart"."onlybart_likes" TO "service_role";



GRANT ALL ON TABLE "onlybart"."onlybart_posts" TO "anon";
GRANT ALL ON TABLE "onlybart"."onlybart_posts" TO "authenticated";
GRANT ALL ON TABLE "onlybart"."onlybart_posts" TO "service_role";



GRANT ALL ON TABLE "public"."banned_accounts" TO "anon";
GRANT ALL ON TABLE "public"."banned_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."banned_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."bartclicker_scores" TO "anon";
GRANT ALL ON TABLE "public"."bartclicker_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."bartclicker_scores" TO "service_role";



GRANT ALL ON TABLE "public"."mod_sync_excluded" TO "anon";
GRANT ALL ON TABLE "public"."mod_sync_excluded" TO "authenticated";
GRANT ALL ON TABLE "public"."mod_sync_excluded" TO "service_role";



GRANT ALL ON TABLE "public"."moderators" TO "anon";
GRANT ALL ON TABLE "public"."moderators" TO "authenticated";
GRANT ALL ON TABLE "public"."moderators" TO "service_role";



GRANT ALL ON TABLE "public"."page_views" TO "anon";
GRANT ALL ON TABLE "public"."page_views" TO "authenticated";
GRANT ALL ON TABLE "public"."page_views" TO "service_role";



GRANT ALL ON SEQUENCE "public"."page_views_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."page_views_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."page_views_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."points" TO "anon";
GRANT ALL ON TABLE "public"."points" TO "authenticated";
GRANT ALL ON TABLE "public"."points" TO "service_role";



GRANT ALL ON TABLE "public"."redeemed_global" TO "anon";
GRANT ALL ON TABLE "public"."redeemed_global" TO "authenticated";
GRANT ALL ON TABLE "public"."redeemed_global" TO "service_role";



GRANT ALL ON TABLE "public"."redeemed_rewards" TO "anon";
GRANT ALL ON TABLE "public"."redeemed_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."redeemed_rewards" TO "service_role";



GRANT ALL ON TABLE "public"."rewards" TO "anon";
GRANT ALL ON TABLE "public"."rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."rewards" TO "service_role";



GRANT ALL ON TABLE "public"."stream_sessions" TO "anon";
GRANT ALL ON TABLE "public"."stream_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."stream_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."twitch_permissions" TO "anon";
GRANT ALL ON TABLE "public"."twitch_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."twitch_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



ALTER TABLE public.bartclicker_scores
    ADD COLUMN auto_click_buyer_unlocked boolean DEFAULT false;
































