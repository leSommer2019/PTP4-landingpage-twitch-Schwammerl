import com.github.twitch4j.TwitchClient;
import com.github.twitch4j.TwitchClientBuilder;
import com.github.twitch4j.events.ChannelGoLiveEvent;
import com.github.twitch4j.events.ChannelGoOfflineEvent;
import com.github.twitch4j.chat.events.channel.ChannelJoinEvent;
import com.github.twitch4j.chat.events.channel.ChannelLeaveEvent;
import com.github.philippheuer.credentialmanager.domain.OAuth2Credential;
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

    public TwitchBot(String oauthToken, String clientId, String channelName, UserPointsManager pointsManager) {
        this(oauthToken, clientId, channelName, pointsManager, 10000); // Standard-Intervall 10 Sekunden
    }

    public TwitchBot(String oauthToken, String clientId, String channelName, UserPointsManager pointsManager, long timerIntervalMs) {
        logger.info("Konstruktor betreten: oauthToken={}, clientId={}, channelName={}, timerIntervalMs={}", oauthToken != null, clientId, channelName, timerIntervalMs);
        this.channelName = channelName;
        this.pointsManager = pointsManager;
        this.timerIntervalMs = timerIntervalMs;
        try {
            // HINWEIS: Der oauthToken MUSS ein Token deines Broadcaster-Accounts sein (z.B. aus .env oder Umgebungsvariable)
            // Beispiel für .env: TWITCH_OAUTH_TOKEN=oauth:dein_token
            OAuth2Credential credential = new OAuth2Credential("twitch", oauthToken);
            this.twitchClient = TwitchClientBuilder.builder()
                    .withEnableChat(true)
                    .withEnableHelix(true)
                    .withChatAccount(credential)
                    .withClientId(clientId)
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
            String userId = event.getUser().getId();
            String username = event.getUser().getName();
            logger.info("User joined: {} ({})", username, userId);
            pointsManager.userJoined(userId, username);
        });
        // Part/Leave Event
        twitchClient.getEventManager().onEvent(ChannelLeaveEvent.class, event -> {
            String userId = event.getUser().getId();
            String username = event.getUser().getName();
            logger.info("User left: {} ({})", username, userId);
            pointsManager.userLeft(userId);
        });
        // Online Event (GoLive)
        twitchClient.getEventManager().onEvent(ChannelGoLiveEvent.class, event -> {
            logger.info("Stream ist online!");
            startTimer();
        });
        // Offline Event
        twitchClient.getEventManager().onEvent(ChannelGoOfflineEvent.class, event -> {
            logger.info("Stream ist offline!");
            int sessionCount = pointsManager.getAllSessions().size();
            logger.info("{} User-Sessions beim Streamende: {}", sessionCount, pointsManager.getAllSessions().keySet());
            for (UserSession session : pointsManager.getAllSessions().values()) {
                if (!session.hasReceivedStayTillEndPoints) {
                    logger.info("Punkte für bis zum Ende geblieben: {} ({})", session.username, session.userId);
                    pointsManager.addPoints(session.userId, 250, "Bis zum Ende geblieben");
                    session.hasReceivedStayTillEndPoints = true;
                }
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
                        logger.info("Punkte für 5 Minuten an {} ({})", session.username, session.userId);
                        pointsManager.addPoints(session.userId, 10, "5 Minuten");
                        session.hasReceived5MinPoints = true;
                    }
                    if (minutes >= 30 && !session.hasReceived30MinPoints) {
                        logger.info("Punkte für 30 Minuten an {} ({})", session.username, session.userId);
                        pointsManager.addPoints(session.userId, 50, "30 Minuten");
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
                logger.info("[Polling] Punkte für bis zum Ende geblieben: {} ({})", session.username, session.userId);
                pointsManager.addPoints(session.userId, 250, "Bis zum Ende geblieben");
                session.hasReceivedStayTillEndPoints = true;
            }
        }
        stopTimer();
    }

    public void connect() {
        logger.info("Bot tritt Channel {} bei...", channelName);
        twitchClient.getChat().joinChannel(channelName);
    }
}
