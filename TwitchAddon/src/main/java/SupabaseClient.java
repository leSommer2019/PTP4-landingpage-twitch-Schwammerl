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

    public void addOrUpdatePoints(String username, int points, String reason) {
        logger.info("addOrUpdatePoints: {} | {} | {}", username, points, reason);
        JSONObject json = new JSONObject();
        json.put("twitch_user_id", username);
        json.put("points", points);
        json.put("reason", reason);
        json.put("timestamp", System.currentTimeMillis());

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/" + tableName + "?twitch_user_id=eq." + username))
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

    public int getPoints(String username) {
        logger.info("getPoints: {}", username);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/" + tableName + "?twitch_user_id=eq." + username))
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
                if (arr.length() > 0) {
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
    public boolean existsUser(String username) {
        logger.info("existsUser: {}", username);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/rest/v1/" + tableName + "?twitch_user_id=eq." + username))
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
                return arr.length() > 0;
            }
        } catch (IOException | InterruptedException e) {
            logger.error("Fehler bei existsUser: {}", e.getMessage(), e);
        }
        return false;
    }

    /**
     * Legt einen neuen User mit 0 Punkten an.
     */
    public void createUser(String username) {
        logger.info("createUser: {}", username);
        JSONObject json = new JSONObject();
        json.put("twitch_user_id", username);
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
}
