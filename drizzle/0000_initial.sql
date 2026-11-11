CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY,
  "email" text NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "merchants" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "area" text NOT NULL,
  "currency" text NOT NULL DEFAULT 'NGN',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "merchant_memberships" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "merchant_id" text NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "merchant_membership_user_merchant_uq" UNIQUE ("user_id", "merchant_id")
);
CREATE INDEX IF NOT EXISTS "merchant_memberships_merchant_idx" ON "merchant_memberships" ("merchant_id");

CREATE TABLE IF NOT EXISTS "merchant_policies" (
  "id" text PRIMARY KEY,
  "merchant_id" text NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "version" text NOT NULL,
  "max_order_kobo" text NOT NULL CHECK ("max_order_kobo" ~ '^[0-9]+$'),
  "daily_cap_kobo" text NOT NULL CHECK ("daily_cap_kobo" ~ '^[0-9]+$'),
  "max_unit_kobo" text NOT NULL CHECK ("max_unit_kobo" ~ '^[0-9]+$'),
  "allowed_suppliers" jsonb NOT NULL,
  "allowed_tokens" jsonb NOT NULL,
  "allowed_recipients" jsonb NOT NULL,
  "approval_threshold_kobo" text NOT NULL CHECK ("approval_threshold_kobo" ~ '^[0-9]+$'),
  "auto_approve_below_kobo" text NOT NULL DEFAULT '0' CHECK ("auto_approve_below_kobo" ~ '^[0-9]+$'),
  "emergency_stop" boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "merchant_policies_merchant_idx" ON "merchant_policies" ("merchant_id");

CREATE TABLE IF NOT EXISTS "restock_requests" (
  "id" text PRIMARY KEY,
  "merchant_id" text NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "max_total_kobo" text NOT NULL CHECK ("max_total_kobo" ~ '^[0-9]+$'),
  "max_unit_price_kobo" text NOT NULL CHECK ("max_unit_price_kobo" ~ '^[0-9]+$'),
  "deadline" text NOT NULL,
  "allowed_suppliers" jsonb NOT NULL,
  "approval_threshold_kobo" text NOT NULL CHECK ("approval_threshold_kobo" ~ '^[0-9]+$'),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "restock_requests_merchant_created_idx" ON "restock_requests" ("merchant_id", "created_at");

CREATE TABLE IF NOT EXISTS "request_lines" (
  "id" text PRIMARY KEY,
  "request_id" text NOT NULL REFERENCES "restock_requests"("id") ON DELETE CASCADE,
  "item_name" text NOT NULL,
  "quantity" integer NOT NULL CHECK ("quantity" > 0),
  "unit" text NOT NULL,
  "max_unit_price_kobo" text NOT NULL CHECK ("max_unit_price_kobo" ~ '^[0-9]+$')
);
CREATE INDEX IF NOT EXISTS "request_lines_request_idx" ON "request_lines" ("request_id");

CREATE TABLE IF NOT EXISTS "procurement_rounds" (
  "id" text PRIMARY KEY,
  "merchant_id" text NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "number" text NOT NULL,
  "status" text NOT NULL,
  "mode" text NOT NULL,
  "title" text NOT NULL,
  "selected_quote_id" text,
  "decision" text NOT NULL,
  "policy_version" text NOT NULL,
  "pooled_total_kobo" text NOT NULL CHECK ("pooled_total_kobo" ~ '^[0-9]+$'),
  "baseline_kobo" text NOT NULL CHECK ("baseline_kobo" ~ '^[0-9]+$'),
  "savings_kobo" text NOT NULL CHECK ("savings_kobo" ~ '^[0-9]+$'),
  "started_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "procurement_rounds_merchant_created_idx" ON "procurement_rounds" ("merchant_id", "created_at");

CREATE TABLE IF NOT EXISTS "round_participants" (
  "round_id" text NOT NULL REFERENCES "procurement_rounds"("id") ON DELETE CASCADE,
  "merchant_id" text NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "request_id" text NOT NULL REFERENCES "restock_requests"("id") ON DELETE RESTRICT,
  "allocation_kobo" text NOT NULL CHECK ("allocation_kobo" ~ '^[0-9]+$'),
  "baseline_kobo" text NOT NULL CHECK ("baseline_kobo" ~ '^[0-9]+$'),
  "saved_kobo" text NOT NULL CHECK ("saved_kobo" ~ '^[0-9]+$'),
  "payment_status" text NOT NULL,
  PRIMARY KEY ("round_id", "merchant_id")
);
CREATE INDEX IF NOT EXISTS "round_participants_merchant_idx" ON "round_participants" ("merchant_id");

CREATE TABLE IF NOT EXISTS "supplier_profiles" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "verified" boolean NOT NULL DEFAULT false,
  "trust_bps" integer NOT NULL DEFAULT 0,
  "evidence" text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS "supplier_quotes" (
  "id" text PRIMARY KEY,
  "round_id" text NOT NULL REFERENCES "procurement_rounds"("id") ON DELETE CASCADE,
  "supplier_id" text NOT NULL REFERENCES "supplier_profiles"("id") ON DELETE RESTRICT,
  "total_kobo" text NOT NULL CHECK ("total_kobo" ~ '^[0-9]+$'),
  "delivery_hours" integer NOT NULL CHECK ("delivery_hours" >= 0),
  "trust_bps" integer NOT NULL CHECK ("trust_bps" BETWEEN 0 AND 10000),
  "score_bps" integer NOT NULL CHECK ("score_bps" BETWEEN 0 AND 10000),
  "eligible" boolean NOT NULL,
  "reasons" jsonb NOT NULL,
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "supplier_note" text NOT NULL DEFAULT '',
  "submitted_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "supplier_quotes_round_idx" ON "supplier_quotes" ("round_id");
CREATE INDEX IF NOT EXISTS "supplier_quotes_supplier_idx" ON "supplier_quotes" ("supplier_id");

CREATE TABLE IF NOT EXISTS "policy_decisions" (
  "id" text PRIMARY KEY,
  "round_id" text NOT NULL REFERENCES "procurement_rounds"("id") ON DELETE CASCADE,
  "merchant_id" text NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "quote_id" text REFERENCES "supplier_quotes"("id") ON DELETE SET NULL,
  "decision" text NOT NULL CHECK ("decision" IN ('allow', 'warn', 'block')),
  "policy_version" text NOT NULL,
  "reasons" jsonb NOT NULL,
  "evaluated_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "policy_decisions_merchant_time_idx" ON "policy_decisions" ("merchant_id", "evaluated_at");

CREATE TABLE IF NOT EXISTS "approval_records" (
  "id" text PRIMARY KEY,
  "round_id" text NOT NULL REFERENCES "procurement_rounds"("id") ON DELETE CASCADE,
  "merchant_id" text NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "payment_fingerprint" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "approved_at" timestamptz,
  CONSTRAINT "approval_records_round_merchant_uq" UNIQUE ("round_id", "merchant_id")
);

CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id" text PRIMARY KEY,
  "round_id" text NOT NULL REFERENCES "procurement_rounds"("id") ON DELETE CASCADE,
  "merchant_id" text NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "approval_id" text REFERENCES "approval_records"("id") ON DELETE SET NULL,
  "amount_kobo" text NOT NULL CHECK ("amount_kobo" ~ '^[0-9]+$'),
  "currency" text NOT NULL,
  "recipient" text NOT NULL,
  "status" text NOT NULL,
  "payment_fingerprint" text NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "payment_intents_round_merchant_uq" UNIQUE ("round_id", "merchant_id")
);
CREATE INDEX IF NOT EXISTS "payment_intents_merchant_time_idx" ON "payment_intents" ("merchant_id", "created_at");

CREATE TABLE IF NOT EXISTS "settlement_receipts" (
  "id" text PRIMARY KEY,
  "payment_intent_id" text NOT NULL UNIQUE REFERENCES "payment_intents"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "transaction_hash" text,
  "transaction_url" text,
  "issued_at" timestamptz NOT NULL DEFAULT now(),
  "metadata" jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" text PRIMARY KEY,
  "merchant_id" text REFERENCES "merchants"("id") ON DELETE SET NULL,
  "round_id" text REFERENCES "procurement_rounds"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "summary" text NOT NULL,
  "metadata" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "audit_events_merchant_time_idx" ON "audit_events" ("merchant_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_events_round_idx" ON "audit_events" ("round_id");

CREATE TABLE IF NOT EXISTS "action_idempotency_keys" (
  "id" text PRIMARY KEY,
  "scope" text NOT NULL,
  "key" text NOT NULL,
  "result_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "action_idempotency_scope_key_uq" UNIQUE ("scope", "key")
);
CREATE INDEX IF NOT EXISTS "action_idempotency_created_idx" ON "action_idempotency_keys" ("created_at");

CREATE TABLE IF NOT EXISTS "dashboard_snapshots" (
  "merchant_id" text PRIMARY KEY REFERENCES "merchants"("id") ON DELETE CASCADE,
  "state" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
