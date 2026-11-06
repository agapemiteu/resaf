ALTER TABLE agent_runs ADD COLUMN resource_id text REFERENCES resources(id);
ALTER TABLE agent_runs ADD COLUMN kind text NOT NULL DEFAULT 'SHOPPER';
CREATE INDEX agent_runs_resource_recent_idx ON agent_runs(resource_id,created_at DESC);
CREATE TABLE business_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id text NOT NULL REFERENCES merchants(id),
  resource_id text REFERENCES resources(id),
  run_id uuid REFERENCES agent_runs(id),
  code text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,code)
);
CREATE TABLE demo_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id text NOT NULL REFERENCES merchants(id),
  resource_id text NOT NULL REFERENCES resources(id),
  request_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_id,request_key)
);
