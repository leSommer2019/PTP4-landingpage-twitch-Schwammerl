import com.github.twitch4j.TwitchClient;
import com.github.twitch4j.TwitchClientBuilder;
import com.github.twitch4j.events.ChannelGoLiveEvent;
import com.github.twitch4j.events.ChannelGoOfflineEvent;
import com.github.twitch4j.chat.events.channel.ChannelJoinEvent;
import com.github.twitch4j.chat.events.channel.ChannelLeaveEvent;
import com.github.philippheuer.credentialmanager.domain.OAuth2Credential;
import com.github.twitch4j.helix.domain.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Timer;
import java.util.TimerTask;

public class TwitchBot {
    private static final Logger logger = LoggerFactory.getLogger(TwitchBot.class);
    private final TwitchClient twitchClient;
    private final UserPointsManager pointsManager;
    private final String channelName;
    private final long timerIntervalMs;
    private Timer timer;
    private Timer streamStatusTimer;
    private boolean lastStreamOnline = false;
    private String oauthToken;
    private final String clientId;
    private final String clientSecret;
    private final String refreshToken;
    // Aktuelle Stream-Session-ID (stream_sessions.id)
    private String currentStreamSessionId = null;

    public TwitchBot(String oauthToken, String clientId, String clientSecret, String refreshToken, String channelName, UserPointsManager pointsManager) {
        this(oauthToken, clientId, clientSecret, refreshToken, channelName, pointsManager, 10000);
    }

    public TwitchBot(String oauthToken, String clientId, String clientSecret, String refreshToken, String channelName, UserPointsManager pointsManager, long timerIntervalMs) {
        logger.info("Konstruktor betreten: oauthToken={}, clientId={}, channelName={}, timerIntervalMs={}", oauthToken != null, clientId, channelName, timerIntervalMs);
        this.oauthToken = oauthToken;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.refreshToken = refreshToken;
        this.channelName = channelName;
        this.pointsManager = pointsManager;
        this.timerIntervalMs = timerIntervalMs;
        try {
            // HINWEIS: Der oauthToken MUSS ein Token deines Broadcaster-Accounts sein (z.B. aus .env oder Umgebungsvariable)
            // Beispiel für .env: TWITCH_OAUTH_TOKEN=oauth:dein_token
            assert oauthToken != null;
            OAuth2Credential credential = new OAuth2Credential("twitch", oauthToken);
            this.twitchClient = TwitchClientBuilder.builder()
                    .withEnableChat(true)
                    .withEnableHelix(true)
                    .withChatAccount(credential)
                    .withClientId(clientId)
                    .withClientSecret(clientSecret)
                    .build();
            logger.info("TwitchBot initialisiert für Channel: {} (Timer-Intervall: {} ms)", channelName, timerIntervalMs);
            logger.info("EventSub aktiviert: false (Polling wird verwendet)");
            registerListeners();
            startStreamStatusPolling(clientId, oauthToken, channelName);
        } catch (Exception e) {
            logger.error("Fehler beim Initialisieren des TwitchBot: {}", e.getMessage(), e);
            throw e;
        }
    }

    private void registerListeners() {
        // Join Event
        twitchClient.getEventManager().onEvent(ChannelJoinEvent.class, event -> {
            String user = event.getUser().getName();
            logger.info("User joined: {}", user);
            String userId = null;
            try {
                // Twitch-User-ID über Helix-API abfragen
                userId = twitchClient.getHelix()
                        .getUsers(null, null, java.util.Collections.singletonList(user))
                        .execute()
                        .getUsers()
                        .stream()
                        .findFirst()
                        .map(User::getId)
                        .orElse(null);
                if (userId == null) {
                    logger.error("Konnte Twitch-User-ID für {} nicht über Helix-API ermitteln!", user);
                }
            } catch (Exception e) {
                logger.error("Fehler beim Abfragen der Twitch-User-ID für {}: {}", user, e.getMessage(), e);
            }
            pointsManager.userJoined(user, userId);
        });
        // Part/Leave Event
        twitchClient.getEventManager().onEvent(ChannelLeaveEvent.class, event -> {
            String user = event.getUser().getName();
            logger.info("User left: {}", user);
            pointsManager.userLeft(user);
        });
        // Online Event (GoLive)
        twitchClient.getEventManager().onEvent(ChannelGoLiveEvent.class, event -> {
            logger.info("Stream ist online!");
            // Erstelle eine neue Stream-Session in der DB
            try {
                String streamIdentifier = channelName + "-" + System.currentTimeMillis();
                String sessionId = pointsManager.createStreamSession(streamIdentifier);
                if (sessionId != null) {
                    currentStreamSessionId = sessionId;
                    logger.info("Neue Stream-Session erstellt: {} (identifier={})", sessionId, streamIdentifier);
                } else {
                    logger.warn("Konnte keine Stream-Session erstellen.");
                }
            } catch (Exception e) {
                logger.error("Fehler beim Erstellen der Stream-Session: {}", e.getMessage(), e);
            }
            startTimer();
        });
        // Offline Event
        twitchClient.getEventManager().onEvent(ChannelGoOfflineEvent.class, event -> {
            logger.info("Stream ist offline!");
            int sessionCount = pointsManager.getAllSessions().size();
            logger.info("{} User-Sessions beim Streamende: {}", sessionCount, pointsManager.getAllSessions().keySet());
            for (UserSession session : pointsManager.getAllSessions().values()) {
                if (!session.hasReceivedStayTillEndPoints) {
                    logger.info("Punkte für bis zum Ende geblieben: {}", session.username);
                    pointsManager.addPoints(session.username, session.userid, 250, "Bis zum Ende geblieben");
                    session.hasReceivedStayTillEndPoints = true;
                }
            }
            // Beende Stream-Session und deaktiviere globale Einlösungen für diese Session
            try {
                if (currentStreamSessionId != null) {
                    boolean deact = pointsManager.deactivateGlobalRedemptionsForSession(currentStreamSessionId);
                    logger.info("redeemed_global Einträge für Session {} deaktiviert: {}", currentStreamSessionId, deact);
                    boolean ended = pointsManager.endStreamSession(currentStreamSessionId);
                    logger.info("Stream-Session {} als beendet markiert: {}", currentStreamSessionId, ended);
                    currentStreamSessionId = null;
                } else {
                    // Fallback: deaktiviere alle aktiven globalen Einlösungen
                    boolean deactAll = pointsManager.deactivateAllActiveGlobalRedemptions();
                    logger.info("Alle aktiven redeemed_global Einträge deaktiviert: {}", deactAll);
                }
                // Leere redeemed_rewards für neuen Stream
                boolean deletedRewards = pointsManager.deleteAllRedeemedRewards();
                logger.info("Alle redeemed_rewards gelöscht: {}", deletedRewards);
            } catch (Exception e) {
                logger.error("Fehler beim Beenden der Stream-Session / Deaktivieren globaler Einlösungen: {}", e.getMessage(), e);
            }
            stopTimer();
        });
    }

    private void startTimer() {
        logger.info("Timer gestartet für Punktvergabe (Intervall: {} ms).", timerIntervalMs);
        timer = new Timer();
        timer.scheduleAtFixedRate(new TimerTask() {
            @Override
            public void run() {
                long now = System.currentTimeMillis();
                int sessionCount = pointsManager.getAllSessions().size();
                logger.info("Timer-Check: {} User-Sessions werden geprüft.", sessionCount);
                for (UserSession session : pointsManager.getAllSessions().values()) {
                    long minutes = (now - session.joinTimestamp) / 60000;
                    if (minutes >= 5 && !session.hasReceived5MinPoints) {
                        logger.info("Punkte für 5 Minuten an {}", session.username);
                        pointsManager.addPoints(session.username, session.userid,10, "5 Minuten");
                        session.hasReceived5MinPoints = true;
                    }
                    if (minutes >= 30 && !session.hasReceived30MinPoints) {
                        logger.info("Punkte für 30 Minuten an {}", session.username);
                        pointsManager.addPoints(session.username, session.userid,50, "30 Minuten");
                        session.hasReceived30MinPoints = true;
                    }
                }
            }
        }, 0, timerIntervalMs); // Intervall jetzt variabel
    }

    private void stopTimer() {
        if (timer != null) {
            logger.info("Timer gestoppt.");
            timer.cancel();
        }
    }

    private void startStreamStatusPolling(String clientId, String oauthToken, String channelName) {
        logger.info("Starte Stream-Status-Polling für {}...", channelName);
        streamStatusTimer = new Timer();
        streamStatusTimer.scheduleAtFixedRate(new TimerTask() {
            @Override
            public void run() {
                try {
                    boolean isOnline = checkStreamOnline(clientId, oauthToken, channelName);
                    if (lastStreamOnline && !isOnline) {
                        logger.info("Stream wurde als OFFLINE erkannt (Polling).");
                        handleStreamEnd();
                    }
                    if (!lastStreamOnline && isOnline) {
                        logger.info("Stream wurde als ONLINE erkannt (Polling).");
                        startTimer();
                    }
                    lastStreamOnline = isOnline;
                } catch (Exception e) {
                    logger.error("Fehler beim Stream-Status-Polling: {}", e.getMessage(), e);
                }
            }
        }, 0, 30000); // alle 30 Sekunden
    }

    private boolean checkStreamOnline(String clientId, String oauthToken, String channelName) throws Exception {
        java.net.http.HttpClient httpClient = java.net.http.HttpClient.newHttpClient();
        String url = "https://api.twitch.tv/helix/streams?user_login=" + channelName;
        java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                .uri(java.net.URI.create(url))
                .header("Client-Id", clientId)
                .header("Authorization", "Bearer " + oauthToken)
                .GET()
                .build();
        java.net.http.HttpResponse<String> response = httpClient.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 200) {
            org.json.JSONObject json = new org.json.JSONObject(response.body());
            return json.getJSONArray("data").length() > 0;
        } else {
            logger.warn("Helix API Fehler: {} {}", response.statusCode(), response.body());
            return false;
        }
    }

    private void handleStreamEnd() {
        int sessionCount = pointsManager.getAllSessions().size();
        logger.info("[Polling] {} User-Sessions beim Streamende: {}", sessionCount, pointsManager.getAllSessions().keySet());
        for (UserSession session : pointsManager.getAllSessions().values()) {
            if (!session.hasReceivedStayTillEndPoints) {
                logger.info("[Polling] Punkte für bis zum Ende geblieben: {}", session.username);
                pointsManager.addPoints(session.username, session.userid,250, "Bis zum Ende geblieben");
                session.hasReceivedStayTillEndPoints = true;
            }
        }
        // Leere redeemed_rewards und deaktiviere alle globalen Einlösungen
        try {
            boolean deletedRewards = pointsManager.deleteAllRedeemedRewards();
            logger.info("[Polling] Alle redeemed_rewards gelöscht: {}", deletedRewards);
            boolean deactAll = pointsManager.deactivateAllActiveGlobalRedemptions();
            logger.info("[Polling] Alle aktiven redeemed_global Einträge deaktiviert: {}", deactAll);
        } catch (Exception e) {
            logger.error("[Polling] Fehler beim Cleanup nach Stream-Ende: {}", e.getMessage(), e);
        }
        stopTimer();
    }

    // Wrapper für Helix-API-Calls mit automatischem Token-Refresh bei "invalid oauth token"
    private <T> T executeWithTokenRetry(TokenApiCall<T> call) throws Exception {
        try {
            return call.execute(oauthToken);
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().toLowerCase().contains("invalid oauth token")) {
                logger.warn("OAuth-Token ungültig, versuche automatischen Refresh...");
                if (refreshOAuthTokenIfNeeded()) {
                    return call.execute(oauthToken);
                } else {
                    throw new Exception("OAuth-Token konnte nicht erneuert werden.", e);
                }
            } else {
                throw e;
            }
        }
    }

    @FunctionalInterface
    private interface TokenApiCall<T> {
        T execute(String token) throws Exception;
    }

    /**
     * Erneuert das OAuth-Token mit dem Refresh-Token und aktualisiert den TwitchClient.
     * Gibt true zurück, wenn erfolgreich.
     */
    private synchronized boolean refreshOAuthTokenIfNeeded() {
        if (refreshToken == null || refreshToken.isEmpty()) {
            logger.error("Kein Refresh-Token vorhanden, kann OAuth-Token nicht erneuern!");
            return false;
        }
        try {
            String newToken = TwitchOAuthUtil.refreshAccessToken(clientId, clientSecret, refreshToken);
            if (newToken != null && !newToken.isEmpty()) {
                logger.info("Neues OAuth-Token per Refresh erhalten. Aktualisiere TwitchClient...");
                this.oauthToken = newToken;
                OAuth2Credential credential = new OAuth2Credential("twitch", newToken);
                // TwitchClient kann nicht direkt das Token wechseln, daher ggf. Neustart nötig
                // Workaround: Hinweis loggen, ggf. Bot-Neustart triggern
                logger.warn("TwitchClient benötigt einen Neustart, um neues Token zu nutzen!");
                return true;
            } else {
                logger.error("Konnte kein neues OAuth-Token generieren.");
                return false;
            }
        } catch (Exception e) {
            logger.error("Fehler beim Erneuern des OAuth-Tokens: {}", e.getMessage(), e);
            return false;
        }
    }

    public void connect() {
        logger.info("Bot tritt Channel {} bei...", channelName);
        twitchClient.getChat().joinChannel(channelName);
    }
}

// Beispielnutzung für Helix-API-Call:
// User user = executeWithTokenRetry(token -> twitchClient.getHelix().getUsers(null, null, List.of(username)).execute().getUsers().get(0));
