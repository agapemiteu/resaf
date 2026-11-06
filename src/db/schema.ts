import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const time = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const merchants = pgTable('merchants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: time(),
});

export const resources = pgTable('resources', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  quantity: integer('quantity').notNull(),
  status: text('status').notNull().default('AVAILABLE'),
  createdAt: time(),
}, (t) => [index('resources_merchant_idx').on(t.merchantId)]);

export const policies = pgTable('reservation_policies', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  resourceId: text('resource_id').notNull().references(() => resources.id),
  version: integer('version').notNull(),
  commitmentAmount: numeric('commitment_amount', { precision: 12, scale: 2 }).notNull(),
  paymentMode: text('payment_mode').notNull().default('AUTHORIZE'),
  purchaseRefundBps: integer('purchase_refund_bps').notNull().default(10000),
  releaseRefundBps: integer('release_refund_bps').notNull().default(10000),
  expiryRefundBps: integer('expiry_refund_bps').notNull().default(10000),
  automation: jsonb('automation'),
  changeSource: text('change_source').notNull().default('merchant'),
  currency: text('currency').notNull(),
  holdDurationSeconds: integer('hold_duration_seconds').notNull(),
  approvalClaimSeconds: integer('approval_claim_seconds').notNull(),
  maxActiveHoldsPerBuyer: integer('max_active_holds_per_buyer').notNull(),
  repeatCooldownSeconds: integer('repeat_cooldown_seconds').notNull(),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: time(),
}, (t) => [
  uniqueIndex('policies_resource_version_idx').on(t.resourceId, t.version),
  index('policies_effective_idx').on(t.resourceId, t.effectiveAt),
]);

export const buyers = pgTable('buyers', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  externalCustomerReference: text('external_customer_reference').notNull(),
  createdAt: time(),
}, (t) => [uniqueIndex('buyers_merchant_reference_idx').on(t.merchantId, t.externalCustomerReference)]);

export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  resourceId: text('resource_id').notNull().references(() => resources.id),
  buyerId: text('buyer_id').notNull().references(() => buyers.id),
  agentId: text('agent_id').notNull(),
  policyId: text('policy_id').notNull().references(() => policies.id),
  policyVersion: integer('policy_version').notNull(),
  status: text('status').notNull(),
  commitmentAmount: numeric('commitment_amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }).notNull(),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  purchaseExpiresAt: timestamp('purchase_expires_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('one_live_claim_per_resource_idx').on(t.resourceId)
    .where(sql`${t.status} in ('PENDING_COMMITMENT', 'RESERVED', 'PURCHASE_PENDING')`),
  index('reservations_buyer_resource_idx').on(t.buyerId, t.resourceId),
  index('reservations_claim_expiry_idx').on(t.claimExpiresAt),
]);

export const reservationEvents = pgTable('reservation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  reservationId: uuid('reservation_id').notNull().references(() => reservations.id),
  type: text('event_type').notNull(),
  payload: text('event_payload').notNull().default('{}'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('events_reservation_time_idx').on(t.reservationId, t.occurredAt)]);

export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  reservationId: uuid('reservation_id').notNull().references(() => reservations.id),
  type: text('type').notNull(),
  providerOrderId: text('provider_order_id'),
  providerAuthorizationId: text('provider_authorization_id'),
  providerCaptureId: text('provider_capture_id'),
  providerRefundId: text('provider_refund_id'),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  status: text('status').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: time(),
}, (t) => [uniqueIndex('payment_idempotency_idx').on(t.idempotencyKey)]);

export const idempotencyRecords = pgTable('idempotency_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  requestKey: text('request_key').notNull(),
  requestHash: text('request_hash').notNull(),
  responseReference: text('response_reference'),
  createdAt: time(),
}, (t) => [uniqueIndex('idempotency_merchant_key_idx').on(t.merchantId, t.requestKey)]);
