CREATE TABLE legacy_demo_holds (
  resource_id text PRIMARY KEY REFERENCES resources(id), holder text,
  expires_at timestamptz, renewals integer NOT NULL DEFAULT 0,
  events jsonb NOT NULL DEFAULT '[]'
);
