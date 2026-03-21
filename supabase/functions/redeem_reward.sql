-- RPC-Funktion: redeem_reward
-- Parameter:
-- p_twitch_user_id text, p_reward_id text, p_description text, p_cost integer, p_ttstext text, p_stream_id text
-- Rückgabe: jsonb mit { success: true, redeemed_id: ..., global_id: ... } oder { error: 'cooldown_active', remaining: N }

CREATE OR REPLACE FUNCTION public.redeem_reward(
  p_twitch_user_id text,
  p_reward_id text,
  p_description text,
  p_cost integer,
  p_ttstext text,
  p_stream_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
    INSERT INTO redeemed_rewards (twitch_user_id, reward_id, timestamp, cost, description, ttstext)
    VALUES (p_twitch_user_id, p_reward_id, now(), p_cost, p_description, p_ttstext)
    RETURNING id INTO v_redeemed_id;

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

