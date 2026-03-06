-- Add appliance/furniture-specific fields to products table
-- voltage: 110V, 220V, Bivolt
-- warranty_months: manufacturer warranty in months
-- serial_number: individual unit traceability

ALTER TABLE products ADD COLUMN IF NOT EXISTS voltage text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_months integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS serial_number text;

-- Add constraint for valid voltage values
ALTER TABLE products ADD CONSTRAINT chk_voltage CHECK (voltage IS NULL OR voltage IN ('110V', '220V', 'Bivolt'));
