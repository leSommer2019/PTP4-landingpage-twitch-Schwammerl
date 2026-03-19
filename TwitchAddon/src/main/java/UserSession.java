public class UserSession {
    public String userId; // Twitch-User-ID (numerisch als String)
    public String username;
    public long joinTimestamp;
    public boolean isFollower;
    public boolean hasReceivedFollowPoints;
    public boolean hasReceived5MinPoints;
    public boolean hasReceived30MinPoints;
    public boolean hasReceivedStayTillEndPoints;

    public UserSession(String userId, String username, long joinTimestamp) {
        this.userId = userId;
        this.username = username;
        this.joinTimestamp = joinTimestamp;
        this.isFollower = false;
        this.hasReceivedFollowPoints = false;
        this.hasReceived5MinPoints = false;
        this.hasReceived30MinPoints = false;
        this.hasReceivedStayTillEndPoints = false;
    }
}

