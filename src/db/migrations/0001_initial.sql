CREATE TABLE merchants (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resources (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'SOLD')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resources_merchant_idx ON resources(merchant_id);

CREATE TABLE reservation_policies (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id),
  resource_id text NOT NULL REFERENCES resources(id),
  version integer NOT NULL CHECK (version > 0),
  commitment_amount numeric(12,2) NOT NULL CHECK (commitment_amount > 0),
  currency text NOT NULL,
  hold_duration_seconds integer NOT NULL CHECK (hold_duration_seconds > 0),
  approval_claim_seconds integer NOT NULL CHECK (approval_claim_seconds > 0),
  max_active_holds_per_buyer integer NOT NULL CHECK (max_active_holds_per_buyer > 0),
  repeat_cooldown_seconds integer NOT NULL CHECK (repeat_cooldown_seconds >= 0),
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_id, version)
);
CREATE INDEX policies_effective_idx ON reservation_policies(resource_id, effective_at DESC);

CREATE TABLE buyers (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id),
  external_customer_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, external_customer_reference)
);

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id text NOT NULL REFERENCES resources(id),
  buyer_id text NOT NULL REFERENCES buyers(id),
  agent_id text NOT NULL,
  policy_id text NOT NULL REFERENCES reservation_policies(id),
  policy_version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING_COMMITMENT', 'RESERVED', 'PURCHASE_PENDING', 'RELEASED', 'EXPIRED', 'PURCHASED', 'FAILED')),
  commitment_amount numeric(12,2) NOT NULL,
  currency text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  claim_expires_at timestamptz NOT NULL,
  activated_at timestamptz,
  expires_at timestamptz,
  ended_at timestamptz
);
CREATE UNIQUE INDEX one_live_claim_per_resource_idx ON reservations(resource_id)
  WHERE status IN ('PENDING_COMMITMENT', 'RESERVED', 'PURCHASE_PENDING');
CREATE INDEX reservations_buyer_resource_idx ON reservations(buyer_id, resource_id);
CREATE INDEX reservations_claim_expiry_idx ON reservations(claim_expires_at);

CREATE TABLE reservation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  event_type text NOT NULL,
  event_payload text NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_reservation_time_idx ON reservation_events(reservation_id, occurred_at);

CREATE TABLE payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  type text NOT NULL,
  provider_order_id text,
  provider_authorization_id text,
  provider_capture_id text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL,
  status text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id text NOT NULL REFERENCES merchants(id),
  request_key text NOT NULL,
  request_hash text NOT NULL,
  response_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, request_key)
);
