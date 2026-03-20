import org.json.JSONObject;
import org.json.JSONArray;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse.BodyHandlers;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SupabaseClient {
    private static final Logger logger = LoggerFactory.getLogger(SupabaseClient.class);
    private final String supabaseUrl;
    private final String apiKey;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final String tableName = "points";

    public SupabaseClient(String supabaseUrl, String apiKey) {
        this.supabaseUrl = supabaseUrl;
        this.apiKey = apiKey;
    }

    public void addOrUpdatePoints(String username, String userid, int points, String reason) {
        logger.info("addOrUpdatePoints: {} | {} | {}", username, points, reason);
        JSONObject json = new JSONObject();
        json.put("twitch_user_id", userid);
        json.put("points", points);
        json.put("reason", reason);
        json.put("timestamp", System.currentTimeMillis());

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/" + tableName + "?twitch_user_id=eq." + userid))
                .header("apikey", apiKey)
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .method("PATCH", BodyPublishers.ofString(json.toString()))
                .timeout(Duration.ofSeconds(10))
                .build();
        try {
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            logger.info("Supabase PATCH Status: {} | Body: {}", response.statusCode(), response.body());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                logger.error("Supabase PATCH fehlgeschlagen: {} {}", response.statusCode(), response.body());
            }
        } catch (IOException | InterruptedException e) {
            logger.error("Fehler beim Supabase PATCH: {}", e.getMessage(), e);
        }
    }

    public int getPoints(String username, String userid) {
        logger.info("getPoints: {}", username);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/" + tableName + "?twitch_user_id=eq." + userid))
                .header("apikey", apiKey)
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .build();
        try {
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            logger.info("Supabase GET Status: {} | Body: {}", response.statusCode(), response.body());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                JSONArray arr = new JSONArray(response.body());
                if (!arr.isEmpty()) {
                    return arr.getJSONObject(0).getInt("points");
                }
            }
        } catch (IOException | InterruptedException e) {
            logger.error("Fehler beim Supabase GET: {}", e.getMessage(), e);
        }
        return 0;
    }

    /**
     * Prüft, ob ein User bereits in der Datenbank existiert.
     */
    public boolean existsUser(String username, String userid) {
        logger.info("existsUser: {}", username);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/" + tableName + "?twitch_user_id=eq." + userid))
                .header("apikey", apiKey)
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .build();
        try {
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            logger.info("Supabase existsUser Status: {} | Body: {}", response.statusCode(), response.body());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                JSONArray arr = new JSONArray(response.body());
                return !arr.isEmpty();
            }
        } catch (IOException | InterruptedException e) {
            logger.error("Fehler bei existsUser: {}", e.getMessage(), e);
        }
        return false;
    }

    /**
     * Legt einen neuen User mit 0 Punkten an.
     */
    public void createUser(String username, String userid) {
        logger.info("createUser: {}", username);
        JSONObject json = new JSONObject();
        json.put("twitch_user_id", userid);
        json.put("points", 0);
        json.put("reason", "init");
        json.put("timestamp", System.currentTimeMillis());
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/" + tableName))
                .header("apikey", apiKey)
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .POST(BodyPublishers.ofString(json.toString()))
                .timeout(Duration.ofSeconds(10))
                .build();
        try {
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            logger.info("Supabase createUser Status: {} | Body: {}", response.statusCode(), response.body());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                logger.error("Supabase createUser fehlgeschlagen: {} {}", response.statusCode(), response.body());
            }
        } catch (IOException | InterruptedException e) {
            logger.error("Fehler bei createUser: {}", e.getMessage(), e);
        }
    }

    /**
     * Gibt alle eingelösten Rewards aus der Tabelle redeemed_rewards zurück.
     */
    public JSONArray getRedeemedRewards() {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/redeemed_rewards"))
                .header("apikey", apiKey)
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .build();
        try {
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                return new JSONArray(response.body());
            }
        } catch (IOException | InterruptedException e) {
            logger.error("Fehler beim Supabase GET redeemed_rewards: {}", e.getMessage(), e);
        }
        return new JSONArray();
    }

    /**
     * Löscht einen Reward aus redeemed_rewards anhand der ID.
     */
    public boolean deleteRedeemedReward(String id) {
        if (id == null) return false;
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/redeemed_rewards?id=eq." + id))
                .header("apikey", apiKey)
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .method("DELETE", BodyPublishers.noBody())
                .timeout(Duration.ofSeconds(10))
                .build();
        try {
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (IOException | InterruptedException e) {
            logger.error("Fehler beim Supabase DELETE redeemed_reward: {}", e.getMessage(), e);
        }
        return false;
    }

    // Fügt einen Reward als Upsert in die Tabelle rewards ein
    public void upsertReward(JSONObject reward) {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(supabaseUrl + "/rest/v1/rewards"))
            .header("apikey", apiKey)
            .header("Authorization", "Bearer " + apiKey)
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .POST(BodyPublishers.ofString("[" + reward.toString() + "]"))
            .timeout(Duration.ofSeconds(10))
            .build();
        try {
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            logger.info("Supabase UPSERT Reward Status: {} | Body: {}", response.statusCode(), response.body());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                logger.error("Supabase UPSERT Reward fehlgeschlagen: {} {}", response.statusCode(), response.body());
            }
        } catch (IOException | InterruptedException e) {
            logger.error("Fehler beim Supabase UPSERT Reward: {}", e.getMessage(), e);
        }
    }

    // Gibt den Cooldown einer Belohnung aus der DB zurück (in Sekunden)
    public int getRewardCooldownFromDb(String rewardId) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/rewards?id=eq." + rewardId))
                .header("apikey", apiKey)
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .build();
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                JSONArray arr = new JSONArray(response.body());
                if (!arr.isEmpty()) {
                    return arr.getJSONObject(0).optInt("cooldown", 0);
                }
            }
        } catch (Exception e) {
            logger.error("Fehler beim Supabase GET rewards (cooldown): {}", e.getMessage(), e);
        }
        return 0;
    }

    /**
     * Prüft, ob ein Reward das Flag onceperstream gesetzt hat.
     */
    public boolean isRewardOncePerStream(String rewardId) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/rewards?id=eq." + rewardId))
                .header("apikey", apiKey)
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .build();
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                JSONArray arr = new JSONArray(response.body());
                if (!arr.isEmpty()) {
                    return arr.getJSONObject(0).optBoolean("onceperstream", false);
                }
            }
        } catch (Exception e) {
            logger.error("Fehler beim Supabase GET rewards (onceperstream): {}", e.getMessage(), e);
        }
        return false;
    }

    // Gibt den letzten Einlösezeitpunkt für einen Reward eines Users zurück (Unix-Timestamp in ms, 0 falls nie eingelöst)
    public long getLastRedemptionTimestampFromRedeemedRewards(String userId, String rewardId) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/redeemed_rewards?select=timestamp&user_id=eq." + userId + "&reward_id=eq." + rewardId + "&order=timestamp.desc&limit=1"))
                .header("apikey", apiKey)
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .build();
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                JSONArray arr = new JSONArray(response.body());
                if (!arr.isEmpty()) {
                    return arr.getJSONObject(0).optLong("timestamp", 0);
                }
            }
        } catch (Exception e) {
            logger.error("Fehler beim Supabase GET redeemed_rewards (timestamp): {}", e.getMessage(), e);
        }
        return 0;
    }

    // Fügt eine Reward-Einlösung in redeemed_rewards ein
    public void insertRedeemedReward(JSONObject redeemedReward) {
        // DEPRECATED: Verwende stattdessen redeemRewardRpc(...) um atomare Prüfungen (cooldown/oncePerStream) serverseitig durchzuführen.
        try {
            String rewardId = redeemedReward.optString("reward_id", null);
            String twitchId = redeemedReward.optString("twitch_user_id", null);
            String description = redeemedReward.optString("description", null);
            int cost = redeemedReward.optInt("cost", 0);
            String tts = redeemedReward.has("ttsText") ? redeemedReward.optString("ttsText", null) : null;
            // Falls die RPC nicht existiert, fällt redeemRewardRpc intern auf direktes Insert zurück
            boolean ok = redeemRewardRpc(twitchId, rewardId, description, cost, tts, null);
            if (!ok) {
                logger.warn("insertRedeemedReward: redeemRewardRpc returned false, fallback to direct insert");
                HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/rest/v1/redeemed_rewards"))
                    .header("apikey", apiKey)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(BodyPublishers.ofString("[" + redeemedReward.toString() + "]"))
                    .timeout(Duration.ofSeconds(10))
                    .build();
                HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    logger.error("Supabase INSERT redeemed_rewards fehlgeschlagen (fallback): {} {}", response.statusCode(), response.body());
                }
            }
        } catch (Exception e) {
            logger.error("Fehler beim Supabase INSERT redeemed_rewards (via RPC fallback): {}", e.getMessage(), e);
        }
    }

    /**
     * Ruft die Supabase RPC-Funktion 'redeem_reward' auf. Liefert true bei Erfolg.
     */
    public boolean redeemRewardRpc(String twitchUserId, String rewardId, String description, int cost, String ttsText, String streamId) {
        try {
            JSONObject params = new JSONObject();
            params.put("p_twitch_user_id", twitchUserId);
            params.put("p_reward_id", rewardId);
            params.put("p_description", description);
            params.put("p_cost", cost);
            params.put("p_ttstext", ttsText);
            params.put("p_stream_id", streamId);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/rpc/redeem_reward"))
                    .header("apikey", apiKey)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(BodyPublishers.ofString(params.toString()))
                    .timeout(Duration.ofSeconds(10))
                    .build();
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                // Response ist JSON mit Ergebnis
                String body = response.body();
                JSONObject res = new JSONObject(body);
                if (res.has("success") && res.getBoolean("success")) {
                    return true;
                } else {
                    logger.info("redeemRewardRpc: returned: {}", res.toString());
                    return false;
                }
            }
        } catch (Exception e) {
            logger.error("Fehler beim Aufruf der RPC redeem_reward: {}", e.getMessage(), e);
        }
        return false;
    }

    /**
     * Gibt einen einzelnen eingelösten Reward anhand der ID zurück (aus redeemed_rewards).
     */
    public JSONObject getRedeemedRewardById(String id) {
        if (id == null) return null;
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/redeemed_rewards?id=eq." + id))
                .header("apikey", apiKey)
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .build();
        try {
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                JSONArray arr = new JSONArray(response.body());
                if (arr.length() > 0) {
                    return arr.getJSONObject(0);
                }
            }
        } catch (IOException | InterruptedException e) {
            logger.error("Fehler beim Supabase GET redeemed_reward by id: {}", e.getMessage(), e);
        }
        return null;
    }

    // Gibt alle Rewards aus der Tabelle rewards zurück
    public JSONArray getRewards() {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/rewards"))
                .header("apikey", apiKey)
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .build();
        try {
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                return new JSONArray(response.body());
            }
        } catch (IOException | InterruptedException e) {
            logger.error("Fehler beim Supabase GET rewards: {}", e.getMessage(), e);
        }
        return new JSONArray();
    }

    /**
     * Prüft, ob eine aktive (globale) Einlösung für ein Reward existiert.
     * Wenn streamId != null übergibt, wird zusätzlich nach stream_id gefiltert.
     */
    public boolean hasActiveGlobalRedemption(String rewardId, String streamId) {
        try {
            String url = supabaseUrl + "/rest/v1/redeemed_global?reward_id=eq." + rewardId + "&is_active=eq.true&limit=1";
            if (streamId != null && !streamId.isEmpty()) {
                url += "&stream_id=eq." + streamId;
            }
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("apikey", apiKey)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Accept", "application/json")
                    .timeout(Duration.ofSeconds(10))
                    .build();
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                JSONArray arr = new JSONArray(response.body());
                if (arr.isEmpty()) return false;
                // Check expires_at: consider entry active only if expires_at is null or in the future
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.getJSONObject(i);
                    if (!obj.has("expires_at") || obj.isNull("expires_at")) {
                        return true;
                    }
                    String expires = obj.optString("expires_at", null);
                    if (expires != null) {
                        java.time.OffsetDateTime odt = java.time.OffsetDateTime.parse(expires);
                        if (odt.toInstant().isAfter(java.time.Instant.now())) {
                            return true;
                        }
                    }
                }
                return false;
            }
        } catch (Exception e) {
            logger.error("Fehler beim Supabase GET redeemed_global (hasActiveGlobalRedemption): {}", e.getMessage(), e);
        }
        return false;
    }

    /**
     * Liefert den letzten globalen Einlösezeitpunkt (epoch ms) für ein Reward oder 0.
     */
    public long getLastGlobalRedemptionTimestamp(String rewardId) {
        try {
            String url = supabaseUrl + "/rest/v1/redeemed_global?select=redeemed_at&reward_id=eq." + rewardId + "&order=redeemed_at.desc&limit=1";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("apikey", apiKey)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Accept", "application/json")
                    .timeout(Duration.ofSeconds(10))
                    .build();
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                JSONArray arr = new JSONArray(response.body());
                if (!arr.isEmpty()) {
                    String ts = arr.getJSONObject(0).optString("redeemed_at", null);
                    if (ts != null) {
                        // parse ISO timestamptz und zurückgeben als epoch ms
                        java.time.OffsetDateTime odt = java.time.OffsetDateTime.parse(ts);
                        return odt.toInstant().toEpochMilli();
                    }
                }
            }
        } catch (Exception e) {
            logger.error("Fehler beim Supabase GET redeemed_global (last timestamp): {}", e.getMessage(), e);
        }
        return 0;
    }

    /**
     * Fügt eine globale Einlösung in redeemed_global ein. Erwartet ein JSON-Objekt mit passenden Feldern.
     * Beispiel-Felder: reward_id, redeemed_by, stream_id, meta
     */
    public boolean insertGlobalRedemption(JSONObject usage) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/rest/v1/redeemed_global"))
                    .header("apikey", apiKey)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(BodyPublishers.ofString("[" + usage.toString() + "]"))
                    .timeout(Duration.ofSeconds(10))
                    .build();
            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return true;
            } else {
                logger.error("Supabase INSERT redeemed_global fehlgeschlagen: {} {}", response.statusCode(), response.body());
            }
        } catch (Exception e) {
            logger.error("Fehler beim Supabase INSERT redeemed_global: {}", e.getMessage(), e);
        }
        return false;
    }

    /**
     * Erstellt eine neue Stream-Session in `stream_sessions` und gibt die erzeugte ID zurück (oder null bei Fehler).
     */
    public String createStreamSession(String streamIdentifier) {
        try {
            JSONObject json = new JSONObject();
            json.put("stream_identifier", streamIdentifier);
            json.put("is_active", true);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/rest/v1/stream_sessions"))
                    .header("apikey", apiKey)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    // return representation so we get the created row with id
                    .header("Prefer", "return=representation")
                    .POST(BodyPublishers.ofString("[" + json.toString() + "]"))
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300 && response.body() != null) {
                JSONArray arr = new JSONArray(response.body());
                if (!arr.isEmpty()) {
                    return arr.getJSONObject(0).optString("id", null);
                }
            } else {
                logger.error("Supabase CREATE stream_session fehlgeschlagen: {} {}", response.statusCode(), response.body());
            }
        } catch (Exception e) {
            logger.error("Fehler beim CREATE stream_session: {}", e.getMessage(), e);
        }
        return null;
    }

    /**
     * Markiert eine Stream-Session als beendet (is_active = false, ended_at gesetzt).
     */
    public boolean endStreamSession(String sessionId) {
        if (sessionId == null) return false;
        try {
            JSONObject json = new JSONObject();
            json.put("is_active", false);
            json.put("ended_at", java.time.OffsetDateTime.now().toString());

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/rest/v1/stream_sessions?id=eq." + sessionId))
                    .header("apikey", apiKey)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .method("PATCH", BodyPublishers.ofString(json.toString()))
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (Exception e) {
            logger.error("Fehler beim Beenden der stream_session: {}", e.getMessage(), e);
        }
        return false;
    }

    /**
     * Deaktiviert alle globalen Einlösungen für eine bestimmte Stream-Session (setzt is_active = false).
     */
    public boolean deactivateGlobalRedemptionsForStream(String sessionId) {
        if (sessionId == null) return false;
        try {
            JSONObject json = new JSONObject();
            json.put("is_active", false);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/rest/v1/redeemed_global?stream_id=eq." + sessionId))
                    .header("apikey", apiKey)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .method("PATCH", BodyPublishers.ofString(json.toString()))
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (Exception e) {
            logger.error("Fehler beim Deaktivieren der redeemed_global für Session {}: {}", sessionId, e.getMessage(), e);
        }
        return false;
    }

    /**
     * Deaktiviert alle aktiven globalen Einlösungen (Hilfsfunktion beim Streamende, um einmal-pro-stream Locks zu resetten).
     */
    public boolean deactivateAllActiveGlobalRedemptions() {
        try {
            JSONObject json = new JSONObject();
            json.put("is_active", false);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(supabaseUrl + "/rest/v1/redeemed_global?is_active=eq.true"))
                    .header("apikey", apiKey)
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .method("PATCH", BodyPublishers.ofString(json.toString()))
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = client.send(request, BodyHandlers.ofString());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (Exception e) {
            logger.error("Fehler beim Deaktivieren aller aktiven redeemed_global Einträge: {}", e.getMessage(), e);
        }
        return false;
    }
}
