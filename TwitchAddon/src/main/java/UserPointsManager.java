import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class UserPointsManager {
    private static final Logger logger = LoggerFactory.getLogger(UserPointsManager.class);
    private final SupabaseClient supabaseClient;
    private final Map<String, UserSession> sessions = new ConcurrentHashMap<>();
    private final String broadcasterId;

    public UserPointsManager(SupabaseClient supabaseClient, String broadcasterId) {
        this.supabaseClient = supabaseClient;
        this.broadcasterId = broadcasterId;
    }

    public boolean isBroadcaster(String username, String userid) {
        return userid != null && userid.equals(broadcasterId);
    }

    public void userJoined(String username, String userid) {
        if (isBroadcaster(username, userid)) {
            logger.info("userJoined: {} (broadcaster, keine Punkte)", username);
            return;
        }
        logger.info("userJoined: {}", username);
        sessions.put(username, new UserSession(username, userid, System.currentTimeMillis()));
        // Prüfe, ob User in DB existiert, sonst anlegen
        if (!supabaseClient.existsUser(username, userid)) {
            supabaseClient.createUser(username, userid);
        }
    }

    public void userLeft(String username) {
        logger.info("userLeft: {}", username);
        sessions.remove(username);
    }

    public UserSession getSession(String username) {
        return sessions.get(username);
    }

    public void addPoints(String username, String userid, int points, String reason) {
        if (isBroadcaster(username, userid) && !"max für broadcaster".equals(reason)) {
            logger.info("addPoints: {} (broadcaster, keine Punkte)", username);
            return;
        }
        logger.info("addPoints: {} | {} | {}", username, points, reason);
        supabaseClient.addOrUpdatePoints(username, userid, points, reason);
    }

    public void setFollower(String username) {
        logger.info("setFollower: {}", username);
        UserSession session = sessions.get(username);
        if (session != null) session.isFollower = true;
    }

    public Map<String, UserSession> getAllSessions() {
        return sessions;
    }

    // --- Stream session / global redemption helpers (wrappers around SupabaseClient)
    public String createStreamSession(String streamIdentifier) {
        return supabaseClient.createStreamSession(streamIdentifier);
    }

    public boolean endStreamSession(String sessionId) {
        return supabaseClient.endStreamSession(sessionId);
    }

    public boolean deactivateGlobalRedemptionsForSession(String sessionId) {
        return supabaseClient.deactivateGlobalRedemptionsForStream(sessionId);
    }

    public boolean deactivateAllActiveGlobalRedemptions() {
        return supabaseClient.deactivateAllActiveGlobalRedemptions();
    }

    public boolean deleteAllRedeemedRewards() {
        return supabaseClient.deleteAllRedeemedRewards();
    }
}
