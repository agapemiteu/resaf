CREATE TABLE business_agent_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id text NOT NULL REFERENCES merchants(id),
  resource_id text NOT NULL REFERENCES resources(id),
  policy_id text NOT NULL REFERENCES reservation_policies(id),
  evaluation_key text NOT NULL UNIQUE,
  signals jsonb NOT NULL,
  decision jsonb,
  status text NOT NULL DEFAULT 'RUNNING',
  created_at timestamptz NOT NULL DEFAULT now()
);
