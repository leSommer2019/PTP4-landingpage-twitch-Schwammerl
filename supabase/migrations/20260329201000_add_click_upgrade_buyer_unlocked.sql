-- Migration: Add click_upgrade_buyer_unlocked to bartclicker_scores
ALTER TABLE public.bartclicker_scores
ADD COLUMN IF NOT EXISTS click_upgrade_buyer_unlocked boolean DEFAULT false;

