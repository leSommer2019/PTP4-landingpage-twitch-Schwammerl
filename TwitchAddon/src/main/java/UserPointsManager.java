import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class UserPointsManager {
    private static final Logger logger = LoggerFactory.getLogger(UserPointsManager.class);
    private final SupabaseClient supabaseClient;
    // Map jetzt nach userId (Twitch-User-ID)
    private final Map<String, UserSession> sessions = new ConcurrentHashMap<>();

    public UserPointsManager(SupabaseClient supabaseClient) {
        this.supabaseClient = supabaseClient;
    }

    // userId = Twitch-User-ID (String), username = Twitch-Name
    public void userJoined(String userId, String username) {
        logger.info("userJoined: {} ({})", username, userId);
        sessions.put(userId, new UserSession(userId, username, System.currentTimeMillis()));
        // Prüfe, ob User in DB existiert, sonst anlegen
        if (!supabaseClient.existsUser(userId)) {
            supabaseClient.createUser(userId);
        }
    }

    public void userLeft(String userId) {
        logger.info("userLeft: {}", userId);
        sessions.remove(userId);
    }

    public UserSession getSession(String userId) {
        return sessions.get(userId);
    }

    public void addPoints(String userId, int points, String reason) {
        logger.info("addPoints: {} | {} | {}", userId, points, reason);
        supabaseClient.addOrUpdatePoints(userId, points, reason);
    }

    public void setFollower(String userId) {
        logger.info("setFollower: {}", userId);
        UserSession session = sessions.get(userId);
        if (session != null) session.isFollower = true;
    }

    public Map<String, UserSession> getAllSessions() {
        return sessions;
    }
}
