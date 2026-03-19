import io.github.cdimascio.dotenv.Dotenv;

import java.io.IOException;

public class Main {
    public static void main(String[] args) throws IOException {
        Dotenv dotenv = Dotenv.load();
        String supabaseUrl = getEnv(dotenv, "SUPABASE_URL");
        String supabaseApiKey = getEnv(dotenv, "SUPABASE_API_KEY");
        String twitchOauthToken = getEnv(dotenv, "TWITCH_OAUTH_TOKEN").startsWith("oauth:") ? getEnv(dotenv, "TWITCH_OAUTH_TOKEN") : "oauth:" + getEnv(dotenv, "TWITCH_OAUTH_TOKEN");
        String twitchClientId = getEnv(dotenv, "TWITCH_CLIENT_ID");
        String twitchClientSecret = getEnv(dotenv, "TWITCH_CLIENT_SECRET");
        String channelName = getEnv(dotenv, "CHANNEL_NAME");

        SupabaseClient supabaseClient = new SupabaseClient(supabaseUrl, supabaseApiKey);
        // Rewards aus rewards.json im aktuellen Arbeitsverzeichnis in die DB synchronisieren
        OverlayApiServer.syncRewardsFromJson(supabaseClient, "rewards.json");
        System.out.println("[Main] Starte Overlay-API-Server...");
        UserPointsManager pointsManager = new UserPointsManager(supabaseClient);
        TwitchBot bot = new TwitchBot(twitchOauthToken, twitchClientId, twitchClientSecret, channelName, pointsManager);
        bot.connect();

        OverlayApiServer overlayApiServer = new OverlayApiServer(supabaseClient);

        System.out.println("Bot läuft. Punkte werden in Supabase gespeichert.");
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
