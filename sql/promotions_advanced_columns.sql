-- Add advanced columns to promotions table for product-specific and category-specific promos
-- Run this in your Supabase SQL Editor

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS scope text DEFAULT 'all';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS product_ids uuid[] DEFAULT '{}';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS category_name text;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS fixed_price numeric DEFAULT 0;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS buy_quantity integer DEFAULT 3;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS pay_quantity integer DEFAULT 2;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_quantity integer DEFAULT 1;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS active_days integer[] DEFAULT '{}';
