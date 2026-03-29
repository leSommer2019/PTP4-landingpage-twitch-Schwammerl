// Shop Items
export interface ShopItem {
  id: number;
  name: string;
  cost: number;
  cps?: number; // Clicks per second (for passive items)
  clickPower?: number; // Power per click
  icon: string;
  type: 'passive' | 'click';
  count: number;
}

// Buffs - Temporary bonuses
export interface Buff {
  id: number;
  name: string;
  icon: string;
  effect: 'cpsMultiplier' | 'clickMultiplier' | 'both';
  value?: number;
  cpsValue?: number;
  clickValue?: number;
  duration: number;
  baseCost: number;
  description: string;
  endTime?: number; // Unix timestamp
  negativeEffect?: {
    chance: number;
    type: 'energyLoss' | 'clickReduction' | 'both';
    value?: number;
    cpsValue?: number;
    clickValue?: number;
    duration?: number;
    description: string;
  };
}

// Debuffs - Temporary penalties
export interface Debuff {
  type: 'energyLoss' | 'clickReduction' | 'both';
  value?: number;
  cpsValue?: number;
  clickValue?: number;
  endTime: number;
  description?: string;
}

// Relics - Permanent bonuses
export interface Relic {
  id: number;
  name: string;
  icon: string;
  effect: 'cpsBonus' | 'clickBonus' | 'offlineBonus' | 'allBonus';
  value?: number;
  cpsValue?: number;
  clickValue?: number;
  unlockCost: number;
  description: string;
}

// Game State from Database
export interface BartclickerGameState {
  id?: string;
  user_id?: string;
  energy: number;
  total_ever: number;
  rebirth_count: number;
  rebirth_multiplier: number;
  shop_items: ShopItem[];
  active_buffs: Buff[];
  active_debuffs: Debuff[];
  relics: Relic[];
  offline_earning_upgrades: number;
   auto_click_buyer_enabled: boolean;
   auto_click_buyer_unlocked: boolean;
   click_upgrade_buyer_enabled: boolean;
   click_upgrade_buyer_unlocked: boolean;
  auto_click_buyer_items: number[];
  click_upgrade_buyer_items: number[];
  last_updated?: string;
  created_at?: string;
}

// Leaderboard entry
export interface BartclickerLeaderboardEntry {
  rank: number;
  user_id: string;
  total_ever: number;
  rebirth_count: number;
  last_updated: string;
  display_name?: string;
}

// Offline progress calculation
export interface OfflineProgress {
  progress: number;
  offlineSeconds: number;
}
