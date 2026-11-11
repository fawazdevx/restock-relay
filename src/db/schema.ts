import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { QuoteLine } from "@/core/types";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  area: text("area").notNull(),
  currency: text("currency").notNull().default("NGN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const merchantMemberships = pgTable("merchant_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("merchant_membership_user_merchant_uq").on(table.userId, table.merchantId), index("merchant_memberships_merchant_idx").on(table.merchantId)]);

export const merchantPolicies = pgTable("merchant_policies", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  maxOrderKobo: text("max_order_kobo").notNull(),
  dailyCapKobo: text("daily_cap_kobo").notNull(),
  maxUnitKobo: text("max_unit_kobo").notNull(),
  allowedSuppliers: jsonb("allowed_suppliers").notNull().$type<string[]>(),
  allowedTokens: jsonb("allowed_tokens").notNull().$type<string[]>(),
  allowedRecipients: jsonb("allowed_recipients").notNull().$type<string[]>(),
  approvalThresholdKobo: text("approval_threshold_kobo").notNull(),
  autoApproveBelowKobo: text("auto_approve_below_kobo").notNull().default("0"),
  emergencyStop: boolean("emergency_stop").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("merchant_policies_merchant_idx").on(table.merchantId)]);

export const restockRequests = pgTable("restock_requests", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  maxTotalKobo: text("max_total_kobo").notNull(),
  maxUnitPriceKobo: text("max_unit_price_kobo").notNull(),
  deadline: text("deadline").notNull(),
  allowedSuppliers: jsonb("allowed_suppliers").notNull().$type<string[]>(),
  approvalThresholdKobo: text("approval_threshold_kobo").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("restock_requests_merchant_created_idx").on(table.merchantId, table.createdAt)]);

export const requestLines = pgTable("request_lines", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => restockRequests.id, { onDelete: "cascade" }),
  itemName: text("item_name").notNull(),
  quantity: integer("quantity").notNull(),
  unit: text("unit").notNull(),
  maxUnitPriceKobo: text("max_unit_price_kobo").notNull(),
}, (table) => [index("request_lines_request_idx").on(table.requestId)]);

export const procurementRounds = pgTable("procurement_rounds", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  status: text("status").notNull(),
  mode: text("mode").notNull(),
  title: text("title").notNull(),
  selectedQuoteId: text("selected_quote_id"),
  decision: text("decision").notNull(),
  policyVersion: text("policy_version").notNull(),
  pooledTotalKobo: text("pooled_total_kobo").notNull(),
  baselineKobo: text("baseline_kobo").notNull(),
  savingsKobo: text("savings_kobo").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("procurement_rounds_merchant_created_idx").on(table.merchantId, table.createdAt)]);

export const roundParticipants = pgTable("round_participants", {
  roundId: text("round_id").notNull().references(() => procurementRounds.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull().references(() => restockRequests.id, { onDelete: "restrict" }),
  allocationKobo: text("allocation_kobo").notNull(),
  baselineKobo: text("baseline_kobo").notNull(),
  savedKobo: text("saved_kobo").notNull(),
  paymentStatus: text("payment_status").notNull(),
}, (table) => [primaryKey({ columns: [table.roundId, table.merchantId] }), index("round_participants_merchant_idx").on(table.merchantId)]);

export const supplierProfiles = pgTable("supplier_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  verified: boolean("verified").notNull().default(false),
  trustBps: integer("trust_bps").notNull().default(0),
  evidence: text("evidence").notNull().default(""),
});

export const supplierQuotes = pgTable("supplier_quotes", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => procurementRounds.id, { onDelete: "cascade" }),
  supplierId: text("supplier_id").notNull().references(() => supplierProfiles.id, { onDelete: "restrict" }),
  totalKobo: text("total_kobo").notNull(),
  deliveryHours: integer("delivery_hours").notNull(),
  trustBps: integer("trust_bps").notNull(),
  scoreBps: integer("score_bps").notNull(),
  eligible: boolean("eligible").notNull(),
  reasons: jsonb("reasons").notNull().$type<string[]>(),
  items: jsonb("items").notNull().$type<QuoteLine[]>(),
  supplierNote: text("supplier_note").notNull().default(""),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("supplier_quotes_round_idx").on(table.roundId), index("supplier_quotes_supplier_idx").on(table.supplierId)]);

export const policyDecisions = pgTable("policy_decisions", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => procurementRounds.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  quoteId: text("quote_id").references(() => supplierQuotes.id, { onDelete: "set null" }),
  decision: text("decision").notNull(),
  policyVersion: text("policy_version").notNull(),
  reasons: jsonb("reasons").notNull().$type<{ code: string; message: string }[]>(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
}, (table) => [index("policy_decisions_merchant_time_idx").on(table.merchantId, table.evaluatedAt)]);

export const approvalRecords = pgTable("approval_records", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => procurementRounds.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  paymentFingerprint: text("payment_fingerprint").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
}, (table) => [uniqueIndex("approval_records_round_merchant_uq").on(table.roundId, table.merchantId)]);

export const paymentIntents = pgTable("payment_intents", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => procurementRounds.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  approvalId: text("approval_id").references(() => approvalRecords.id, { onDelete: "set null" }),
  amountKobo: text("amount_kobo").notNull(),
  currency: text("currency").notNull(),
  recipient: text("recipient").notNull(),
  status: text("status").notNull(),
  paymentFingerprint: text("payment_fingerprint").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("payment_intents_idempotency_uq").on(table.idempotencyKey), uniqueIndex("payment_intents_round_merchant_uq").on(table.roundId, table.merchantId), index("payment_intents_merchant_time_idx").on(table.merchantId, table.createdAt)]);

export const settlementReceipts = pgTable("settlement_receipts", {
  id: text("id").primaryKey(),
  paymentIntentId: text("payment_intent_id").notNull().references(() => paymentIntents.id, { onDelete: "cascade" }).unique(),
  status: text("status").notNull(),
  transactionHash: text("transaction_hash"),
  transactionUrl: text("transaction_url"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata").notNull().$type<Record<string, unknown>>(),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
  roundId: text("round_id").references(() => procurementRounds.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [index("audit_events_merchant_time_idx").on(table.merchantId, table.createdAt), index("audit_events_round_idx").on(table.roundId)]);

export const actionIdempotencyKeys = pgTable("action_idempotency_keys", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  key: text("key").notNull(),
  resultId: text("result_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("action_idempotency_scope_key_uq").on(table.scope, table.key), index("action_idempotency_created_idx").on(table.createdAt)]);

export const dashboardSnapshots = pgTable("dashboard_snapshots", {
  merchantId: text("merchant_id").primaryKey().references(() => merchants.id, { onDelete: "cascade" }),
  state: jsonb("state").notNull().$type<unknown>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
