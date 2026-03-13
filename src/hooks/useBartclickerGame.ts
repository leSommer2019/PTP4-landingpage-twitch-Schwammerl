import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/useAuth';
import { supabase } from '../lib/supabase';
import type {
  BartclickerGameState,
  ShopItem,
  Buff,
} from '../types/bartclicker';

// Initial shop items definition
const INITIAL_SHOP_ITEMS: ShopItem[] = [
  { id: 0, name: 'Bart-Kamm', cost: 15, cps: 0.1, icon: '🪮', type: 'passive', count: 0 },
  { id: 1, name: 'WLAN-Bartöl', cost: 100, cps: 1, icon: '💧', type: 'passive', count: 0 },
  { id: 2, name: 'Energy Drink', cost: 500, cps: 4, icon: '⚡', type: 'passive', count: 0 },
  { id: 3, name: 'Loot-Lama', cost: 2500, cps: 12, icon: '🦙', type: 'passive', count: 0 },
  { id: 4, name: 'Sektenschwur', cost: 12000, cps: 45, icon: '🐑', type: 'passive', count: 0 },
  { id: 5, name: 'Dampf-Pflege', cost: 60000, cps: 180, icon: '⚙️', type: 'passive', count: 0 },
  { id: 6, name: 'Bart-Fabrik', cost: 250000, cps: 800, icon: '🏭', type: 'passive', count: 0 },
  { id: 7, name: 'Starker Griff', cost: 50, clickPower: 1, icon: '💪', type: 'click', count: 0 },
  { id: 8, name: 'Bart-Verstärker', cost: 500, clickPower: 5, icon: '🔥', type: 'click', count: 0 },
  { id: 9, name: 'Mega-Klicker', cost: 5000, clickPower: 25, icon: '⚡', type: 'click', count: 0 },
  { id: 10, name: 'Göttlicher Touch', cost: 50000, clickPower: 100, icon: '✨', type: 'click', count: 0 },
  { id: 11, name: 'Bart-Imperium', cost: 12500000, cps: 3500, icon: '🏰', type: 'passive', count: 0 },
  { id: 12, name: 'Kosmische Bartmine', cost: 50000000, cps: 18000, icon: '🌌', type: 'passive', count: 0 },
  { id: 13, name: 'Ultimativer Klick', cost: 5000000, clickPower: 500, icon: '💫', type: 'click', count: 0 },
  { id: 14, name: 'Dimensionale Hand', cost: 20000000, clickPower: 2500, icon: '🌀', type: 'click', count: 0 },
  { id: 15, name: 'Unendlicher Bart-Reaktor', cost: 100000000, cps: 100000, icon: '⚛️', type: 'passive', count: 0 },
];

const AVAILABLE_BUFFS: Buff[] = [
  {
    id: 0,
    name: 'Turbo-Boost',
    icon: '⚡',
    effect: 'cpsMultiplier',
    value: 2,
    duration: 60000,
    baseCost: 1000,
    description: '2x CPS für 1 Minute',
  },
  {
    id: 1,
    name: 'Klick-Wahnsinn',
    icon: '💪',
    effect: 'clickMultiplier',
    value: 3,
    duration: 45000,
    baseCost: 1500,
    description: '3x Klick-Power für 45s',
  },
];

export function useBartclickerGame() {
  const { user } = useAuth();
  
  // Game state
  const [gameState, setGameState] = useState<BartclickerGameState>({
    energy: 0,
    total_ever: 0,
    rebirth_count: 0,
    rebirth_multiplier: 1,
    shop_items: INITIAL_SHOP_ITEMS,
    active_buffs: [],
    active_debuffs: [],
    relics: [],
    offline_earning_upgrades: 0,
    auto_click_buyer_enabled: false,
    click_upgrade_buyer_enabled: false,
    auto_click_buyer_items: [],
    click_upgrade_buyer_items: [],
  });

  const [cps, setCps] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaveTime, setLastSaveTime] = useState(0);
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Calculate CPS based on shop items, relics, and multipliers
  const calculateCps = useCallback((): number => {
    let totalCps = gameState.shop_items.reduce((sum, item) => {
      if (item.type === 'passive' && item.cps) {
        return sum + item.cps * item.count * gameState.rebirth_multiplier;
      }
      return sum;
    }, 0);

    // Apply relic bonuses
    gameState.relics.forEach((relic) => {
      if (relic.effect === 'cpsBonus' || relic.effect === 'allBonus') {
        const bonus = relic.cpsValue || relic.value || 0;
        totalCps *= 1 + bonus;
      }
    });

    // Apply active buffs
    gameState.active_buffs.forEach((buff) => {
      if (buff.effect === 'cpsMultiplier' || buff.effect === 'both') {
        totalCps *= buff.value || buff.cpsValue || 1;
      }
    });

    // Apply active debuffs
    gameState.active_debuffs.forEach((debuff) => {
      if (debuff.type === 'both' || debuff.type === 'energyLoss') {
        totalCps *= 1 - (debuff.cpsValue || debuff.value || 0);
      }
    });

    return Math.max(0, totalCps);
  }, [gameState]);

  // Calculate click power
  const calculateClickPower = useCallback((): number => {
    let power = gameState.shop_items.reduce((sum, item) => {
      if (item.type === 'click' && item.clickPower) {
        return sum + item.clickPower * item.count * gameState.rebirth_multiplier;
      }
      return sum;
    }, 0);

    // Apply relic bonuses
    gameState.relics.forEach((relic) => {
      if (relic.effect === 'clickBonus' || relic.effect === 'allBonus') {
        const bonus = relic.clickValue || relic.value || 0;
        power *= 1 + bonus;
      }
    });

    // Apply active buffs
    gameState.active_buffs.forEach((buff) => {
      if (buff.effect === 'clickMultiplier' || buff.effect === 'both') {
        power *= buff.value || buff.clickValue || 1;
      }
    });

    // Apply active debuffs
    gameState.active_debuffs.forEach((debuff) => {
      if (debuff.type === 'both' || debuff.type === 'clickReduction') {
        power *= 1 - (debuff.clickValue || debuff.value || 0);
      }
    });

    return Math.max(1, power);
  }, [gameState]);

  // Load game state from database
  const loadGameState = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('bartclicker_scores')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows found (expected for new users)
        console.error('Error loading game state:', error);
      } else if (data) {
        // Existing data found
        setGameState({
          id: data.id,
          user_id: data.user_id,
          energy: parseFloat(data.energy) || 0,
          total_ever: parseFloat(data.total_ever) || 0,
          rebirth_count: data.rebirth_count || 0,
          rebirth_multiplier: parseFloat(data.rebirth_multiplier) || 1,
          shop_items: (data.shop_items || []).map((item: any) => ({
            ...item,
            cost: item.cost || INITIAL_SHOP_ITEMS.find(i => i.id === item.id)?.cost || 0,
          })),
          active_buffs: (data.active_buffs || []).filter((buff: any) => buff.endTime && buff.endTime > Date.now()),
          active_debuffs: (data.active_debuffs || []).filter((debuff: any) => debuff.endTime && debuff.endTime > Date.now()),
          relics: data.relics || [],
          offline_earning_upgrades: data.offline_earning_upgrades || 0,
          auto_click_buyer_enabled: data.auto_click_buyer_enabled || false,
          click_upgrade_buyer_enabled: data.click_upgrade_buyer_enabled || false,
          auto_click_buyer_items: data.auto_click_buyer_items || [],
          click_upgrade_buyer_items: data.click_upgrade_buyer_items || [],
          last_updated: data.last_updated,
          created_at: data.created_at,
        });
      } else {
        // New user - create initial entry
        const initialState: BartclickerGameState = {
          user_id: user.id,
          energy: 0,
          total_ever: 0,
          rebirth_count: 0,
          rebirth_multiplier: 1,
          shop_items: INITIAL_SHOP_ITEMS,
          active_buffs: [],
          active_debuffs: [],
          relics: [],
          offline_earning_upgrades: 0,
          auto_click_buyer_enabled: false,
          click_upgrade_buyer_enabled: false,
          auto_click_buyer_items: [],
          click_upgrade_buyer_items: [],
        };
        setGameState(initialState);
      }
    } catch (err) {
      console.error('Failed to load game state:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Save game state to database
  const saveGameState = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('bartclicker_scores')
        .upsert(
          {
            user_id: user.id,
            energy: gameState.energy.toString(),
            total_ever: gameState.total_ever.toString(),
            rebirth_count: gameState.rebirth_count,
            rebirth_multiplier: gameState.rebirth_multiplier.toString(),
            shop_items: gameState.shop_items,
            active_buffs: gameState.active_buffs,
            active_debuffs: gameState.active_debuffs,
            relics: gameState.relics,
            offline_earning_upgrades: gameState.offline_earning_upgrades,
            auto_click_buyer_enabled: gameState.auto_click_buyer_enabled,
            click_upgrade_buyer_enabled: gameState.click_upgrade_buyer_enabled,
            auto_click_buyer_items: gameState.auto_click_buyer_items,
            click_upgrade_buyer_items: gameState.click_upgrade_buyer_items,
            last_updated: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('Error saving game state:', error);
      }
    } catch (err) {
      console.error('Failed to save game state:', err);
    }
  }, [user?.id, gameState]);

  // Handle click
  const handleClick = useCallback(() => {
    const power = calculateClickPower();

    setGameState((prev) => ({
      ...prev,
      energy: prev.energy + power,
      total_ever: prev.total_ever + power,
    }));
  }, [calculateClickPower]);

  // Buy shop item
  const buyItem = useCallback(
    (itemId: number) => {
      const item = gameState.shop_items.find((i) => i.id === itemId);
      if (!item || gameState.energy < item.cost) return false;

      setGameState((prev) => ({
        ...prev,
        energy: prev.energy - item.cost,
        shop_items: prev.shop_items.map((i) =>
          i.id === itemId ? { ...i, count: i.count + 1, cost: Math.floor(i.cost * 1.15) } : i
        ),
      }));

      return true;
    },
    [gameState.energy, gameState.shop_items]
  );

  // Activate buff
  const activateBuff = useCallback(
    (buffId: number) => {
      const buff = AVAILABLE_BUFFS.find((b) => b.id === buffId);
      if (!buff) return false;

      const cost = buff.baseCost * Math.pow(2, gameState.rebirth_count);
      if (gameState.energy < cost) return false;

      const endTime = Date.now() + buff.duration;

      setGameState((prev) => ({
        ...prev,
        energy: prev.energy - cost,
        active_buffs: [
          ...prev.active_buffs,
          {
            ...buff,
            endTime,
          },
        ],
      }));

      return true;
    },
    [gameState.energy, gameState.rebirth_count]
  );

  // Rebirth
  const performRebirth = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      rebirth_count: prev.rebirth_count + 1,
      rebirth_multiplier: Math.pow(2, prev.rebirth_count + 1),
      energy: 0,
      shop_items: prev.shop_items.map((item) => ({
        ...item,
        count: 0,
        cost: INITIAL_SHOP_ITEMS.find((i) => i.id === item.id)?.cost || item.cost,
      })),
      active_buffs: [],
      active_debuffs: [],
    }));
  }, []);

  // Game loop for CPS
  useEffect(() => {
    const newCps = calculateCps();
    setCps(newCps);

    // Set up game loop
    if (gameLoopRef.current) clearInterval(gameLoopRef.current);

    gameLoopRef.current = setInterval(() => {
      setGameState((prev) => ({
        ...prev,
        energy: prev.energy + newCps / 10, // Update every 100ms
        total_ever: prev.total_ever + newCps / 10,
      }));
    }, 100);

    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [calculateCps]);

  // Load initial state
  useEffect(() => {
    loadGameState();
  }, [loadGameState]);

  // Auto-save periodically (every 10 seconds)
  useEffect(() => {
    const saveInterval = setInterval(() => {
      saveGameState();
    }, 10000); // Save every 10 seconds

    return () => clearInterval(saveInterval);
  }, [saveGameState]);

  // Also save on important state changes (rebirth, shop item count changes)
  useEffect(() => {
    const now = Date.now();
    if (now - lastSaveTime > 5000) {
      // Don't save too frequently - at least 5 seconds between saves
      saveGameState();
      setLastSaveTime(now);
    }
  }, [gameState.rebirth_count, gameState.shop_items.length, saveGameState, lastSaveTime]);

  return {
    gameState,
    isLoading,
    clickPower: calculateClickPower(),
    cps,
    handleClick,
    buyItem,
    activateBuff,
    performRebirth,
    saveGameState,
    loadGameState,
  };
}




