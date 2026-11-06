ALTER TABLE reservation_policies ADD COLUMN automation jsonb;
ALTER TABLE reservation_policies ADD COLUMN change_source text NOT NULL DEFAULT 'merchant';
