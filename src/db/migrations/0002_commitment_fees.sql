ALTER TABLE reservation_policies ADD COLUMN payment_mode text NOT NULL DEFAULT 'AUTHORIZE'
  CHECK (payment_mode IN ('AUTHORIZE', 'CAPTURE'));
ALTER TABLE reservation_policies ADD COLUMN purchase_refund_bps integer NOT NULL DEFAULT 10000 CHECK (purchase_refund_bps BETWEEN 0 AND 10000);
ALTER TABLE reservation_policies ADD COLUMN release_refund_bps integer NOT NULL DEFAULT 10000 CHECK (release_refund_bps BETWEEN 0 AND 10000);
ALTER TABLE reservation_policies ADD COLUMN expiry_refund_bps integer NOT NULL DEFAULT 10000 CHECK (expiry_refund_bps BETWEEN 0 AND 10000);
ALTER TABLE payment_transactions ADD COLUMN provider_refund_id text;
