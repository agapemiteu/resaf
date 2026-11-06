INSERT INTO merchants (id, name) VALUES ('merchant-001', 'Resaf Demo Merchant') ON CONFLICT DO NOTHING;
INSERT INTO resources (id, merchant_id, title, description, price, currency, quantity)
VALUES ('bag-001', 'merchant-001', 'Rare Designer Handbag', 'One-of-one demonstration inventory', 1400.00, 'USD', 1)
ON CONFLICT DO NOTHING;
INSERT INTO reservation_policies
  (id, merchant_id, resource_id, version, commitment_amount, currency, hold_duration_seconds, approval_claim_seconds, max_active_holds_per_buyer, repeat_cooldown_seconds)
VALUES ('policy_unique_001', 'merchant-001', 'bag-001', 1, 2.00, 'USD', 600, 90, 1, 3600)
ON CONFLICT DO NOTHING;
INSERT INTO reservation_policies
  (id, merchant_id, resource_id, version, commitment_amount, currency, hold_duration_seconds, approval_claim_seconds, max_active_holds_per_buyer, repeat_cooldown_seconds)
VALUES ('policy_unique_002', 'merchant-001', 'bag-001', 2, 2.00, 'USD', 600, 300, 1, 3600)
ON CONFLICT DO NOTHING;
INSERT INTO reservation_policies
  (id, merchant_id, resource_id, version, commitment_amount, currency, hold_duration_seconds,
   approval_claim_seconds, max_active_holds_per_buyer, repeat_cooldown_seconds,
   payment_mode, purchase_refund_bps, release_refund_bps, expiry_refund_bps)
VALUES ('policy_unique_003', 'merchant-001', 'bag-001', 3, 2.00, 'USD', 600,
  300, 1, 3600, 'CAPTURE', 10000, 5000, 0)
ON CONFLICT DO NOTHING;
INSERT INTO buyers (id, merchant_id, external_customer_reference) VALUES
  ('buyer-a', 'merchant-001', 'demo-buyer-a'),
  ('buyer-b', 'merchant-001', 'demo-buyer-b')
ON CONFLICT DO NOTHING;
INSERT INTO resources (id,merchant_id,title,description,price,currency,quantity)
VALUES ('demo-resource-001','merchant-001','Parking space P-01',
  'One exclusive unit in a merchant system. The same reservation API can represent a room, appointment, space or item.',25.00,'USD',1)
ON CONFLICT DO NOTHING;
INSERT INTO reservation_policies
  (id,merchant_id,resource_id,version,commitment_amount,currency,hold_duration_seconds,approval_claim_seconds,
   max_active_holds_per_buyer,repeat_cooldown_seconds,payment_mode,purchase_refund_bps,release_refund_bps,expiry_refund_bps)
VALUES ('policy_demo_001','merchant-001','demo-resource-001',1,2.00,'USD',600,300,1,3600,'CAPTURE',10000,5000,0)
ON CONFLICT DO NOTHING;
