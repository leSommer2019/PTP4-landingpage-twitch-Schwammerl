import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { BartclickerLeaderboardEntry } from '../types/bartclicker';

export function useBartclickerLeaderboard() {
  const [entries, setEntries] = useState<BartclickerLeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('bartclicker_scores')
          .select('user_id, total_ever, rebirth_count, last_updated')
          .order('total_ever', { ascending: false })
          .order('rebirth_count', { ascending: false })
          .limit(100);

        if (fetchError) {
          console.error('Error loading leaderboard:', fetchError);
          setError('Failed to load leaderboard');
          return;
        }

        if (data) {
          // Get user profiles for display names - aber mit Error Handling
          const leaderboardEntries: BartclickerLeaderboardEntry[] = await Promise.all(
            data.map(async (entry, index) => {
              try {
                // Versuche Username zu laden
                const { data: profile, error: profileError } = await supabase
                  .from('profiles')
                  .select('username')
                  .eq('id', entry.user_id)
                  .single();

                let displayName = `Player ${index + 1}`;
                
                if (!profileError && profile?.username) {
                  displayName = profile.username;
                }

                return {
                  rank: index + 1,
                  user_id: entry.user_id,
                  total_ever: parseFloat(entry.total_ever.toString()) || 0,
                  rebirth_count: entry.rebirth_count || 0,
                  last_updated: entry.last_updated || new Date().toISOString(),
                  display_name: displayName,
                };
              } catch (profileErr) {
                // Fallback bei Fehler
                console.debug('Error loading profile for user_id:', entry.user_id, profileErr);
                return {
                  rank: index + 1,
                  user_id: entry.user_id,
                  total_ever: parseFloat(entry.total_ever.toString()) || 0,
                  rebirth_count: entry.rebirth_count || 0,
                  last_updated: entry.last_updated || new Date().toISOString(),
                  display_name: `Player ${index + 1}`,
                };
              }
            })
          );

          setEntries(leaderboardEntries);
        }
      } catch (err) {
        console.error('Failed to load leaderboard:', err);
        setError('Failed to load leaderboard');
      } finally {
        setIsLoading(false);
      }
    };

    loadLeaderboard();
    
    // Refresh leaderboard every 30 seconds
    const interval = setInterval(loadLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  return {
    entries,
    isLoading,
    error,
  };
}

