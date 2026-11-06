CREATE TABLE paypal_webhook_events (
  id text PRIMARY KEY, event_type text NOT NULL, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED', attempts integer NOT NULL DEFAULT 0,
  last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
