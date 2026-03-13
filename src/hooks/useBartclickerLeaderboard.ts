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
          // Sammle alle user_ids
          const userIds = data.map(entry => entry.user_id);
          
          // Lade alle Profile in einer Abfrage
          const { data: profiles} = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', userIds);

          // Erstelle eine Map für schnelle Lookups
          const profileMap = new Map(profiles?.map(p => [p.id, p.username]) ?? []);

          const leaderboardEntries: BartclickerLeaderboardEntry[] = data.map((entry, index) => {
            const displayName = profileMap.get(entry.user_id) || `Player ${index + 1}`;
            
            return {
              rank: index + 1,
              user_id: entry.user_id,
              total_ever: parseFloat(entry.total_ever.toString()) || 0,
              rebirth_count: entry.rebirth_count || 0,
              last_updated: entry.last_updated || new Date().toISOString(),
              display_name: displayName,
            };
          });

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

