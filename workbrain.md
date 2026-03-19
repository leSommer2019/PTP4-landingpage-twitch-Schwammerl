Klassiker! Diese Einstellung in den Supabase Edge Functions ist oft ein Stolperstein.

Warum das jz geht:
Wenn "Verify JWT" an ist, erwartet Supabase bei jedem Aufruf der Function einen gültigen Supabase-Auth-Token (den anon key oder einen User-JWT). Da du wahrscheinlich von Twitch oder einem externen Tool direkt auf die URL zugreifst (ohne den passenden Authorization Header mitschicken zu können), hat Supabase den Zugriff mit einem 401 Unauthorized blockiert.

Da es jetzt aus ist, ist deine Function "öffentlich" erreichbar. Das ist für Webhooks (wie von Twitch) auch genau der richtige Weg, da Twitch keine Supabase-JWTs kennt.
Kurzer Sicherheits-Tipp für die Zukunft:

Da die Function nun ohne Supabase-Sperre erreichbar ist, solltest du (falls noch nicht geschehen) innerhalb deines Codes prüfen, ob der Aufruf legitim ist. Bei Twitch-Webhooks macht man das normalerweise über die Twitch-Eventsub-Message-Signature.

Aber erst mal: Glückwunsch zum Fix! Manchmal sind es eben doch nur die kleinen Schalter im Dashboard. 😉