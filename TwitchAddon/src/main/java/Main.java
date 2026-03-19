import com.github.twitch4j.TwitchClient;
import com.github.twitch4j.TwitchClientBuilder;
import com.github.twitch4j.helix.domain.User;
import io.github.cdimascio.dotenv.Dotenv;

import java.io.IOException;
import java.util.Collections;

public class Main {
    public static void main(String[] args) throws IOException {
        Dotenv dotenv = Dotenv.load();
        String supabaseUrl = getEnv(dotenv, "SUPABASE_URL");
        String supabaseApiKey = getEnv(dotenv, "SUPABASE_API_KEY");
        String twitchOauthToken = getEnv(dotenv, "TWITCH_OAUTH_TOKEN").startsWith("oauth:") ? getEnv(dotenv, "TWITCH_OAUTH_TOKEN") : "oauth:" + getEnv(dotenv, "TWITCH_OAUTH_TOKEN");
        String twitchClientId = getEnv(dotenv, "TWITCH_CLIENT_ID");
        String twitchClientSecret = getEnv(dotenv, "TWITCH_CLIENT_SECRET");
        String channelName = getEnv(dotenv, "CHANNEL_NAME");
        String twitchRefreshToken = getEnv(dotenv, "TWITCH_REFRESH_TOKEN");

        // OAuth-Token ggf. mit Refresh-Token erneuern
        if (twitchRefreshToken != null && !twitchRefreshToken.isEmpty()) {
            try {
                String newAccessToken = TwitchOAuthUtil.refreshAccessToken(twitchClientId, twitchClientSecret, twitchRefreshToken);
                if (newAccessToken != null && !newAccessToken.isEmpty()) {
                    twitchOauthToken = newAccessToken;
                    System.out.println("[Main] Neues OAuth-Token mit Refresh-Token generiert.");
                } else {
                    System.err.println("[Main] Konnte kein neues OAuth-Token generieren, benutze vorhandenes.");
                }
            } catch (Exception e) {
                System.err.println("[Main] Fehler beim Erneuern des OAuth-Tokens: " + e.getMessage());
            }
        }

        SupabaseClient supabaseClient = new SupabaseClient(supabaseUrl, supabaseApiKey);
        // OverlayApiServer.syncRewardsFromJson entfernt, da rewards.json nicht mehr verwendet wird
        System.out.println("[Main] Starte Overlay-API-Server...");

        // Broadcaster-ID ermitteln
        String broadcasterId = null;
        try {
            TwitchClient twitchClient = TwitchClientBuilder.builder()
                    .withEnableHelix(true)
                    .withClientId(twitchClientId)
                    .withClientSecret(twitchClientSecret)
                    .withEnableChat(false)
                    .withEnablePubSub(false)
                    .build();
            broadcasterId = twitchClient.getHelix()
                    .getUsers(null, null, Collections.singletonList(channelName))
                    .execute()
                    .getUsers()
                    .stream()
                    .findFirst()
                    .map(User::getId)
                    .orElse(null);
        } catch (Exception e) {
            System.err.println("[Main] Fehler beim Ermitteln der Broadcaster-ID: " + e.getMessage());
        }
        if (broadcasterId == null) {
            System.err.println("[Main] Konnte Broadcaster-ID für " + channelName + " nicht ermitteln! Bot wird beendet.");
            System.exit(1);
        }
        UserPointsManager pointsManager = new UserPointsManager(supabaseClient, broadcasterId);
        TwitchBot bot = new TwitchBot(twitchOauthToken, twitchClientId, twitchClientSecret, twitchRefreshToken, channelName, pointsManager);
        bot.connect();

        OverlayApiServer overlayApiServer = new OverlayApiServer(supabaseClient);

        System.out.println("Bot läuft. Punkte werden in Supabase gespeichert.");

        // Broadcaster automatisch maximale Punkte geben
        pointsManager.addPoints(channelName, broadcasterId, 2_147_483_647, "max für broadcaster");
        System.out.println("[Main] Broadcaster " + channelName + " (" + broadcasterId + ") erhält maximale Punkte.");
    }

    /**
     * Holt eine Umgebungsvariable: zuerst aus Dotenv, dann aus System.getenv().
     */
    private static String getEnv(Dotenv dotenv, String key) {
        String value = dotenv.get(key);
        if (value == null || value.isEmpty()) {
            value = System.getenv(key);
        }
        return value;
    }
}
