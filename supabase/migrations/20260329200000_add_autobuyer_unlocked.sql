-- Migration: Add auto_click_buyer_unlocked to bartclicker_scores
ALTER TABLE public.bartclicker_scores
ADD COLUMN IF NOT EXISTS auto_click_buyer_unlocked boolean DEFAULT false;

