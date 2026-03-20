import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Paths;

public class OverlayApiServer {
    private final SupabaseClient supabaseClient;

    public OverlayApiServer(SupabaseClient supabaseClient) throws IOException {
        this.supabaseClient = supabaseClient;
        HttpServer server = HttpServer.create(new java.net.InetSocketAddress(8081), 0);
        server.createContext("/api/redeemed_rewards", new RedeemedRewardsHandler());
        server.createContext("/api/rewards", new RewardsHandler());
        server.createContext("/api/redeem_check", new RedeemCheckHandler());
        // server.createContext("/api/rewards.json", new RewardsJsonHandler()); // entfernt
        // server.createContext("/api/redeem_reward", new RedeemRewardHandler()); // entfernt, Redeems laufen nur noch über Supabase
        server.createContext("/overlay.html", new StaticFileHandler("overlay.html", "text/html"));
        server.createContext("/media", new StaticDirHandler("media"));
        server.setExecutor(null);
        server.start();
    }

    class RedeemedRewardsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String method = exchange.getRequestMethod();
            if (method.equalsIgnoreCase("GET")) {
                JSONArray rewards = supabaseClient.getRedeemedRewards();
                String response = rewards.toString();
                byte[] responseBytes = response.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, responseBytes.length);
                OutputStream os = exchange.getResponseBody();
                os.write(responseBytes);
                os.close();
            } else if (method.equalsIgnoreCase("DELETE")) {
                String query = exchange.getRequestURI().getQuery();
                String id = null;
                if (query != null) {
                    for (String param : query.split("&")) {
                        if (param.startsWith("id=")) {
                            id = param.substring(3);
                            break;
                        }
                    }
                }
                System.out.println("[OverlayApiServer] DELETE-Request für redeemed_reward id=" + id);
                // NEU: Vor dem Löschen prüfen, ob Cooldown abgelaufen ist
                JSONObject redeemedReward = supabaseClient.getRedeemedRewardById(id);
                if (redeemedReward == null) {
                    exchange.sendResponseHeaders(404, 0);
                    exchange.getResponseBody().close();
                    return;
                }
                String rewardId = redeemedReward.getString("reward_id");
                long timestamp = redeemedReward.getLong("timestamp");
                int cooldown = supabaseClient.getRewardCooldownFromDb(rewardId); // Sekunden
                String redeemedBy = redeemedReward.optString("twitch_user_id", null);
                int redeemedCost = redeemedReward.optInt("cost", 0);
                long now = System.currentTimeMillis();
                long elapsed = (now - timestamp) / 1000L;

                // 1) Prüfe once-per-stream auf Reward-Definition
                boolean oncePerStream = supabaseClient.isRewardOncePerStream(rewardId);
                if (oncePerStream) {
                    // Prüfe, ob es einen aktiven globalen Eintrag für diese Belohnung in redeemed_global gibt (stream_id kann null sein)
                    boolean activeGlobal = supabaseClient.hasActiveGlobalRedemption(rewardId, null);
                    if (activeGlobal) {
                        // Wenn bereits eine globale Einlösung aktiv ist: lösche den eingelösten Eintrag und erstatte Punkte
                        // Hinweis: SupabaseClient.deleteRedeemedReward löscht aus redeemed_rewards
                        boolean deleted = supabaseClient.deleteRedeemedReward(id);
                        // Refund points if we know who redeemed and cost
                        boolean refunded = false;
                        if (redeemedBy != null && redeemedCost > 0) {
                            supabaseClient.addOrUpdatePoints(redeemedBy, redeemedBy, redeemedCost, "Refund blocked redemption");
                            refunded = true;
                        }
                        // Rückgabe: informiere Caller, dass Reward nicht ausgeführt wurde und Punkte zurückerstattet wurden
                        JSONObject resp = new JSONObject();
                        resp.put("success", false);
                        resp.put("error", "once_per_stream_active");
                        resp.put("action", "refunded_and_deleted");
                        resp.put("deleted", deleted);
                        resp.put("refunded", refunded);
                        String respStr = resp.toString();
                        exchange.getResponseHeaders().add("Content-Type", "application/json");
                        exchange.sendResponseHeaders(200, respStr.length());
                        exchange.getResponseBody().write(respStr.getBytes());
                        exchange.getResponseBody().close();
                        return;
                    }
                }

                // 2) Prüfe globalen Cooldown: Wenn ein globaler Eintrag existiert, verwende dessen Zeitstempel
                long lastGlobal = supabaseClient.getLastGlobalRedemptionTimestamp(rewardId);
                if (lastGlobal > 0) {
                    long globalElapsed = (now - lastGlobal) / 1000L;
                    if (cooldown > 0 && globalElapsed < cooldown) {
                        // Auch hier: wenn globaler Lock existiert => lösche eingelösten Reward und refund
                        boolean deleted = supabaseClient.deleteRedeemedReward(id);
                        boolean refunded = false;
                        if (redeemedBy != null && redeemedCost > 0) {
                            supabaseClient.addOrUpdatePoints(redeemedBy, redeemedBy, redeemedCost, "Refund blocked redemption");
                            refunded = true;
                        }
                        JSONObject resp = new JSONObject();
                        resp.put("success", false);
                        resp.put("error", "cooldown_active");
                        resp.put("cooldown", cooldown);
                        resp.put("remaining", cooldown - globalElapsed);
                        resp.put("action", "refunded_and_deleted");
                        resp.put("deleted", deleted);
                        resp.put("refunded", refunded);
                        String respStr = resp.toString();
                        exchange.getResponseHeaders().add("Content-Type", "application/json");
                        exchange.sendResponseHeaders(200, respStr.length());
                        exchange.getResponseBody().write(respStr.getBytes());
                        exchange.getResponseBody().close();
                        return;
                    }
                } else {
                    // Fallback: benutze timestamp aus redeemed_rewards (alte Logik)
                    if (cooldown > 0 && elapsed < cooldown) {
                        boolean deleted = supabaseClient.deleteRedeemedReward(id);
                        boolean refunded = false;
                        if (redeemedBy != null && redeemedCost > 0) {
                            supabaseClient.addOrUpdatePoints(redeemedBy, redeemedBy, redeemedCost, "Refund blocked redemption");
                            refunded = true;
                        }
                        JSONObject resp = new JSONObject();
                        resp.put("success", false);
                        resp.put("cooldown", cooldown);
                        resp.put("remaining", cooldown - elapsed);
                        resp.put("action", "refunded_and_deleted");
                        resp.put("deleted", deleted);
                        resp.put("refunded", refunded);
                        String respStr = resp.toString();
                        exchange.getResponseHeaders().add("Content-Type", "application/json");
                        exchange.sendResponseHeaders(200, respStr.length());
                        exchange.getResponseBody().write(respStr.getBytes());
                        exchange.getResponseBody().close();
                        return;
                    }
                }
                // Cooldown abgelaufen, jetzt löschen
                boolean success = supabaseClient.deleteRedeemedReward(id);
                System.out.println("[OverlayApiServer] DELETE-Result für id=" + id + ": " + (success ? "deleted" : "not found"));
                String response = success ? "deleted" : "not found";
                exchange.sendResponseHeaders(success ? 200 : 404, response.length());
                OutputStream os = exchange.getResponseBody();
                os.write(response.getBytes());
                os.close();
            } else {
                exchange.sendResponseHeaders(405, 0);
                exchange.getResponseBody().close();
            }
        }
    }

    class RedeemCheckHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!exchange.getRequestMethod().equalsIgnoreCase("GET")) {
                exchange.sendResponseHeaders(405, 0);
                exchange.getResponseBody().close();
                return;
            }
            String query = exchange.getRequestURI().getQuery();
            String id = null;
            if (query != null) {
                for (String param : query.split("&")) {
                    if (param.startsWith("id=")) {
                        id = param.substring(3);
                        break;
                    }
                }
            }
            if (id == null) {
                exchange.sendResponseHeaders(400, 0);
                exchange.getResponseBody().close();
                return;
            }
            JSONObject redeemedReward = supabaseClient.getRedeemedRewardById(id);
            if (redeemedReward == null) {
                exchange.sendResponseHeaders(404, 0);
                exchange.getResponseBody().close();
                return;
            }
            String rewardId = redeemedReward.optString("reward_id", null);
            String redeemedBy = redeemedReward.optString("twitch_user_id", null);
            int redeemedCost = redeemedReward.optInt("cost", 0);

            // Check once-per-stream
            boolean oncePerStream = supabaseClient.isRewardOncePerStream(rewardId);
            if (oncePerStream) {
                boolean activeGlobal = supabaseClient.hasActiveGlobalRedemption(rewardId, null);
                if (activeGlobal) {
                    boolean deleted = supabaseClient.deleteRedeemedReward(id);
                    boolean refunded = false;
                    if (redeemedBy != null && redeemedCost > 0) {
                        supabaseClient.addOrUpdatePoints(redeemedBy, redeemedBy, redeemedCost, "Refund blocked redemption");
                        refunded = true;
                    }
                    JSONObject resp = new JSONObject();
                    resp.put("allowed", false);
                    resp.put("error", "once_per_stream_active");
                    resp.put("deleted", deleted);
                    resp.put("refunded", refunded);
                    String respStr = resp.toString();
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, respStr.length());
                    exchange.getResponseBody().write(respStr.getBytes());
                    exchange.getResponseBody().close();
                    return;
                }
            }

            // Check global cooldown
            long lastGlobal = supabaseClient.getLastGlobalRedemptionTimestamp(rewardId);
            int cooldown = supabaseClient.getRewardCooldownFromDb(rewardId);
            long now = System.currentTimeMillis();
            if (lastGlobal > 0) {
                long globalElapsed = (now - lastGlobal) / 1000L;
                if (cooldown > 0 && globalElapsed < cooldown) {
                    boolean deleted = supabaseClient.deleteRedeemedReward(id);
                    boolean refunded = false;
                    if (redeemedBy != null && redeemedCost > 0) {
                        supabaseClient.addOrUpdatePoints(redeemedBy, redeemedBy, redeemedCost, "Refund blocked redemption");
                        refunded = true;
                    }
                    JSONObject resp = new JSONObject();
                    resp.put("allowed", false);
                    resp.put("error", "cooldown_active");
                    resp.put("remaining", cooldown - globalElapsed);
                    resp.put("deleted", deleted);
                    resp.put("refunded", refunded);
                    String respStr = resp.toString();
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, respStr.length());
                    exchange.getResponseBody().write(respStr.getBytes());
                    exchange.getResponseBody().close();
                    return;
                }
            }

            // No block -> allowed
            JSONObject ok = new JSONObject();
            ok.put("allowed", true);
            String okStr = ok.toString();
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, okStr.length());
            exchange.getResponseBody().write(okStr.getBytes());
            exchange.getResponseBody().close();
        }
    }

    class RewardsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String method = exchange.getRequestMethod();
            if (method.equalsIgnoreCase("GET")) {
                JSONArray rewards = supabaseClient.getRewards(); // Annahme: getRewards() liefert alle Rewards aus der DB
                String response = rewards.toString();
                byte[] responseBytes = response.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, responseBytes.length);
                OutputStream os = exchange.getResponseBody();
                os.write(responseBytes);
                os.close();
            } else {
                exchange.sendResponseHeaders(405, 0);
                exchange.getResponseBody().close();
            }
        }
    }

    // RewardsJsonHandler entfernt, da rewards.json nicht mehr verwendet wird

    // Handler für das Einlösen von Rewards mit Cooldown-Prüfung wurde entfernt, da Redeems nur noch über Supabase laufen

    static class StaticFileHandler implements HttpHandler {
        private final String resourcePath;
        private final String contentType;
        public StaticFileHandler(String resourcePath, String contentType) {
            this.resourcePath = resourcePath;
            this.contentType = contentType;
        }
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            try (java.io.InputStream is = getClass().getClassLoader().getResourceAsStream(resourcePath)) {
                if (is == null) {
                    exchange.sendResponseHeaders(404, 0);
                    exchange.getResponseBody().close();
                    return;
                }
                byte[] data = is.readAllBytes();
                exchange.getResponseHeaders().add("Content-Type", contentType);
                exchange.sendResponseHeaders(200, data.length);
                OutputStream os = exchange.getResponseBody();
                os.write(data);
                os.close();
            } catch (IOException e) {
                exchange.sendResponseHeaders(500, 0);
                exchange.getResponseBody().close();
            }
        }
    }

    static class StaticDirHandler implements HttpHandler {
        private final String resourceDir;
        public StaticDirHandler(String resourceDir) {
            this.resourceDir = resourceDir;
        }
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String uri = exchange.getRequestURI().getPath();
            String fileName = uri.substring(uri.lastIndexOf("/") + 1);
            String resourcePath = resourceDir + "/" + fileName;
            try (java.io.InputStream is = getClass().getClassLoader().getResourceAsStream(resourcePath)) {
                if (is == null) {
                    exchange.sendResponseHeaders(404, 0);
                    exchange.getResponseBody().close();
                    return;
                }
                String contentType = java.nio.file.Files.probeContentType(java.nio.file.Paths.get(fileName));
                byte[] data = is.readAllBytes();
                exchange.getResponseHeaders().add("Content-Type", contentType != null ? contentType : "application/octet-stream");
                exchange.sendResponseHeaders(200, data.length);
                OutputStream os = exchange.getResponseBody();
                os.write(data);
                os.close();
            } catch (IOException e) {
                exchange.sendResponseHeaders(500, 0);
                exchange.getResponseBody().close();
            }
        }
    }

    // syncRewardsFromJson entfernt, da rewards.json nicht mehr verwendet wird
}
