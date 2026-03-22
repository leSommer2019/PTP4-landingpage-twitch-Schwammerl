// Supabase Edge Function (TypeScript) zum automatischen Löschen abgelaufener redeemed_global-Einträge
// Diese Funktion kann per Zeitplan (Scheduled Trigger) ausgeführt werden

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ResponseLike {
  status(code: number): this;
  json(body: unknown): void;
}

export default async function handler(res: ResponseLike) {
  const { error } = await supabase
    .from('redeemed_global')
    .delete()
    .lt('redeemed_at', new Date().toISOString());
  if (error) {
    res.status(500).json({ error: error.message });
  } else {
    res.status(200).json({ message: 'Expired redeemed_global rows deleted.' });
  }
}
