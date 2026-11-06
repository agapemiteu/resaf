CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id text NOT NULL REFERENCES merchants(id),
  buyer_id text NOT NULL REFERENCES buyers(id),
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  request_key text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]',
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_id,buyer_id,request_key)
);
