ALTER TABLE resources ADD COLUMN kind text NOT NULL DEFAULT 'general'
  CHECK (kind IN ('general','parking','hotel','restaurant','item'));
UPDATE resources SET kind = 'parking' WHERE id = 'demo-resource-001';
UPDATE resources SET kind = 'item' WHERE id = 'bag-001';
