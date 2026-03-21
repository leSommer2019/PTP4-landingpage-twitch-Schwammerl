import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;

public class OverlayApiServer {
    private final SupabaseClient supabaseClient;

    public OverlayApiServer(SupabaseClient supabaseClient) throws IOException {
        this.supabaseClient = supabaseClient;
        HttpServer server = HttpServer.create(new java.net.InetSocketAddress(8081), 0);
        server.createContext("/api/redeemed_rewards", new RedeemedRewardsHandler());
        server.createContext("/api/rewards", new RewardsHandler());
        server.createContext("/api/redeem_check", new RedeemCheckHandler());
        server.createContext("/overlay.html", new StaticFileHandler("overlay.html", "text/html"));
        server.createContext("/tts-test.html", new StaticFileHandler("tts-test.html", "text/html"));
        server.createContext("/media", new StaticDirHandler("media"));
        server.createContext("/api/tts", new TtsProxyHandler());
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

                if (id == null || id.isEmpty()) {
                    String resp = "{\"error\":\"missing_id\"}";
                    exchange.sendResponseHeaders(400, resp.length());
                    exchange.getResponseBody().write(resp.getBytes());
                    exchange.getResponseBody().close();
                    return;
                }

                JSONObject redeemedReward = supabaseClient.getRedeemedRewardById(id);
                if (redeemedReward == null) {
                    exchange.sendResponseHeaders(404, 0);
                    exchange.getResponseBody().close();
                    return;
                }

                String rewardId = redeemedReward.getString("reward_id");
                String redeemedBy = redeemedReward.optString("twitch_user_id", null);

                // 1. Einfach und ohne Wenn und Aber aus der Warteschlange löschen!
                boolean success = supabaseClient.deleteRedeemedReward(id);

                // 2. redeemed_global per Plugin setzen, sobald es erfolgreich verarbeitet wurde
                if (success) {
                    boolean oncePerStream = supabaseClient.isRewardOncePerStream(rewardId);
                    int cooldown = supabaseClient.getRewardCooldownFromDb(rewardId);

                    if (oncePerStream || cooldown > 0) {
                        JSONObject globalLock = new JSONObject();
                        globalLock.put("reward_id", rewardId);
                        globalLock.put("redeemed_by", redeemedBy);
                        globalLock.put("is_active", true);

                        // Wenn oncePerStream, läuft es bis zum Stream-Ende (wo dein TwitchBot es ohnehin löscht).
                        // Falls es nur ein Cooldown ist, setzen wir die genaue Ablaufzeit.
                        if (!oncePerStream && cooldown > 0) {
                            java.time.OffsetDateTime expires = java.time.OffsetDateTime.now().plusSeconds(cooldown);
                            globalLock.put("expires_at", expires.toString());
                        }

                        System.out.println("[OverlayApiServer] Globaler Lock gesetzt für Reward: " + rewardId);
                    }
                }

                String response = success ? "deleted" : "delete failed";
                exchange.sendResponseHeaders(success ? 200 : 500, response.length());
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

            // DEPRECATED: Diese Prüfung sollte nur noch zur Info dienen.
            // Die Cooldown/Once-Per-Stream Prüfung und Punkte-Debit erfolgen jetzt ALLE in der RPC-Funktion!
            // Daher werden hier KEINE Punkte mehr automatisch zurückgegeben.

            String rewardId = redeemedReward.optString("reward_id", null);

            // Check once-per-stream (nur zur Info)
            boolean oncePerStream = supabaseClient.isRewardOncePerStream(rewardId);
            if (oncePerStream) {
                boolean activeGlobal = supabaseClient.hasActiveGlobalRedemption(rewardId, null);
                if (activeGlobal) {
                    JSONObject resp = new JSONObject();
                    resp.put("allowed", false);
                    resp.put("error", "once_per_stream_active");
                    resp.put("info", "RPC sollte dies bereits blockiert haben. Punkte wurden NICHT zurückgegeben (RPC handhabt Debit).");
                    String respStr = resp.toString();
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, respStr.length());
                    exchange.getResponseBody().write(respStr.getBytes());
                    exchange.getResponseBody().close();
                    return;
                }
            }

            // Check global cooldown (nur zur Info)
            long lastGlobal = supabaseClient.getLastGlobalRedemptionTimestamp(rewardId);
            int cooldown = supabaseClient.getRewardCooldownFromDb(rewardId);
            long now = System.currentTimeMillis();
            if (lastGlobal > 0) {
                long globalElapsed = (now - lastGlobal) / 1000L;
                if (cooldown > 0 && globalElapsed < cooldown) {
                    JSONObject resp = new JSONObject();
                    resp.put("allowed", false);
                    resp.put("error", "cooldown_active");
                    resp.put("remaining", cooldown - globalElapsed);
                    resp.put("info", "RPC sollte dies bereits blockiert haben. Punkte wurden NICHT zurückgegeben (RPC handhabt Debit).");
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

}
