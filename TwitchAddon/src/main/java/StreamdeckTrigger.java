public class StreamdeckTrigger {
    private final UserPointsManager userPointsManager;

    public StreamdeckTrigger(UserPointsManager userPointsManager) {
        this.userPointsManager = userPointsManager;
    }

    public void trigger(String username, String userid, int points, String reason) {
        userPointsManager.addPoints(username, userid, points, reason);
    }
    // Placeholder-Methode für StreamDeck-Action
    public static void triggerStreamDeckAction(String text) {
        System.out.println("[StreamDeckAction] Triggered mit Text: " + text);
        // TODO: Hier später die echte StreamDeck-Integration einbauen
    }
}