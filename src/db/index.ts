import "server-only";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { DashboardState } from "@/core/types";

let client: ReturnType<typeof postgres> | null = null;
let drizzleDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDatabase() {
  if (!process.env.DATABASE_URL) return null;
  if (!client || !drizzleDb) {
    client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    drizzleDb = drizzle(client, { schema });
  }
  return drizzleDb;
}

export function configuredStorage(): "memory" | "postgres" {
  return process.env.DATABASE_URL ? "postgres" : "memory";
}

const DEMO_USER_ID = "demo-user-restock-relay";

function merchantArea(id: string): string {
  return id.includes("surulere") ? "Surulere" : "Yaba";
}

export async function readDashboardSnapshot(merchantId: string): Promise<DashboardState | null> {
  const db = getDatabase();
  if (!db) return null;
  const rows = await db.select({ state: schema.dashboardSnapshots.state }).from(schema.dashboardSnapshots).where(eq(schema.dashboardSnapshots.merchantId, merchantId)).limit(1);
  return rows[0]?.state as DashboardState | undefined ?? null;
}

export type StoredActionClaim = "claimed" | "complete" | "pending" | "conflict";

function pendingActionResult(requestHash: string) {
  return `pending:${requestHash}`;
}

function completedActionResult(requestHash: string, resultId: string) {
  return `complete:${requestHash}:${resultId}`;
}

export async function claimStoredAction(scope: string, key: string, requestHash: string): Promise<StoredActionClaim> {
  const db = getDatabase();
  if (!db) return "claimed";
  return db.transaction(async (tx) => {
    const id = `${scope}-${createHash("sha256").update(key).digest("hex")}`;
    const inserted = await tx.insert(schema.actionIdempotencyKeys).values({
      id,
      scope,
      key,
      resultId: pendingActionResult(requestHash),
    }).onConflictDoNothing().returning({ id: schema.actionIdempotencyKeys.id });
    if (inserted.length) return "claimed";

    const rows = await tx.select({ resultId: schema.actionIdempotencyKeys.resultId })
      .from(schema.actionIdempotencyKeys)
      .where(and(eq(schema.actionIdempotencyKeys.scope, scope), eq(schema.actionIdempotencyKeys.key, key)))
      .limit(1);
    const resultId = rows[0]?.resultId;
    if (!resultId) return "conflict";
    if (resultId.startsWith("pending:")) {
      return resultId === pendingActionResult(requestHash) ? "pending" : "conflict";
    }
    if (resultId.startsWith("complete:")) {
      const storedHash = resultId.slice("complete:".length).split(":", 1)[0];
      return storedHash === requestHash ? "complete" : "conflict";
    }
    // Rows created by the earlier demo version have no request hash; keep treating them as replays.
    return "complete";
  });
}

export async function releaseStoredAction(scope: string, key: string, requestHash: string): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  await db.delete(schema.actionIdempotencyKeys).where(and(
    eq(schema.actionIdempotencyKeys.scope, scope),
    eq(schema.actionIdempotencyKeys.key, key),
    eq(schema.actionIdempotencyKeys.resultId, pendingActionResult(requestHash)),
  ));
}

export type ActionIdempotency = { scope: string; key: string; requestHash: string };

export async function persistDashboardState(state: DashboardState, idempotency?: ActionIdempotency | ActionIdempotency[]): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  const now = new Date();
  await db.transaction(async (tx) => {
    const merchantRows = new Map<string, { id: string; name: string; area: string; currency: string }>();
    merchantRows.set(state.merchantId, { id: state.merchantId, name: state.merchantName, area: merchantArea(state.merchantId), currency: "NGN" });
    for (const request of state.requests) merchantRows.set(request.merchantId, { id: request.merchantId, name: request.merchantName, area: merchantArea(request.merchantId), currency: "NGN" });
    for (const shop of state.round.shops) merchantRows.set(shop.id, { id: shop.id, name: shop.name, area: shop.area, currency: "NGN" });

    await tx.insert(schema.users).values({ id: DEMO_USER_ID, email: "demo-owner@restock-relay.local" }).onConflictDoNothing();
    for (const merchant of merchantRows.values()) {
      await tx.insert(schema.merchants).values(merchant).onConflictDoUpdate({ target: schema.merchants.id, set: { name: merchant.name, area: merchant.area } });
    }
    await tx.insert(schema.merchantMemberships).values({ id: `membership-${DEMO_USER_ID}-${state.merchantId}`, userId: DEMO_USER_ID, merchantId: state.merchantId, role: "owner" }).onConflictDoNothing();
    await tx.insert(schema.merchantPolicies).values({
      id: `policy-${state.merchantId}`,
      merchantId: state.merchantId,
      version: state.policy.version,
      maxOrderKobo: state.policy.maxOrderKobo,
      dailyCapKobo: state.policy.dailyCapKobo,
      maxUnitKobo: state.policy.maxUnitKobo,
      allowedSuppliers: state.policy.allowedSuppliers,
      allowedTokens: state.policy.allowedTokens,
      allowedRecipients: state.policy.allowedRecipients,
      approvalThresholdKobo: state.policy.approvalThresholdKobo,
      autoApproveBelowKobo: state.policy.autoApproveBelowKobo,
      emergencyStop: state.policy.emergencyStop,
      updatedAt: now,
    }).onConflictDoUpdate({ target: schema.merchantPolicies.id, set: {
      version: state.policy.version,
      maxOrderKobo: state.policy.maxOrderKobo,
      dailyCapKobo: state.policy.dailyCapKobo,
      maxUnitKobo: state.policy.maxUnitKobo,
      allowedSuppliers: state.policy.allowedSuppliers,
      allowedTokens: state.policy.allowedTokens,
      allowedRecipients: state.policy.allowedRecipients,
      approvalThresholdKobo: state.policy.approvalThresholdKobo,
      autoApproveBelowKobo: state.policy.autoApproveBelowKobo,
      emergencyStop: state.policy.emergencyStop,
      updatedAt: now,
    } });

    for (const request of state.requests) {
      await tx.insert(schema.restockRequests).values({
        id: request.id,
        merchantId: request.merchantId,
        title: request.title,
        maxTotalKobo: request.maxTotalKobo,
        maxUnitPriceKobo: request.maxUnitPriceKobo,
        deadline: request.deadline,
        allowedSuppliers: request.allowedSuppliers,
        approvalThresholdKobo: request.approvalThresholdKobo,
      }).onConflictDoUpdate({ target: schema.restockRequests.id, set: { title: request.title, maxTotalKobo: request.maxTotalKobo, maxUnitPriceKobo: request.maxUnitPriceKobo, deadline: request.deadline, allowedSuppliers: request.allowedSuppliers, approvalThresholdKobo: request.approvalThresholdKobo } });
      for (const item of request.items) {
        await tx.insert(schema.requestLines).values({ id: `${request.id}-${item.id}`, requestId: request.id, itemName: item.name, quantity: item.quantity, unit: item.unit, maxUnitPriceKobo: item.maxUnitPriceKobo }).onConflictDoUpdate({ target: schema.requestLines.id, set: { itemName: item.name, quantity: item.quantity, unit: item.unit, maxUnitPriceKobo: item.maxUnitPriceKobo } });
      }
    }

    const round = state.round;
    await tx.insert(schema.procurementRounds).values({
      id: round.id,
      merchantId: state.merchantId,
      number: round.number,
      status: round.status,
      mode: round.mode,
      title: round.title,
      selectedQuoteId: round.selectedQuoteId ?? null,
      decision: round.decision.decision,
      policyVersion: round.decision.policyVersion,
      pooledTotalKobo: round.pooledTotalKobo,
      baselineKobo: round.baselineKobo,
      savingsKobo: round.savingsKobo,
      startedAt: new Date(round.startedAt),
      completedAt: round.completedAt ? new Date(round.completedAt) : null,
    }).onConflictDoUpdate({ target: schema.procurementRounds.id, set: {
      status: round.status,
      selectedQuoteId: round.selectedQuoteId ?? null,
      decision: round.decision.decision,
      policyVersion: round.decision.policyVersion,
      pooledTotalKobo: round.pooledTotalKobo,
      baselineKobo: round.baselineKobo,
      savingsKobo: round.savingsKobo,
      completedAt: round.completedAt ? new Date(round.completedAt) : null,
    } });

    for (const quote of round.quotes) {
      await tx.insert(schema.supplierProfiles).values({ id: quote.supplierId, name: quote.supplierName, verified: false, trustBps: quote.trustBps, evidence: quote.trustEvidence }).onConflictDoUpdate({ target: schema.supplierProfiles.id, set: { name: quote.supplierName, verified: false, trustBps: quote.trustBps, evidence: quote.trustEvidence } });
      await tx.insert(schema.supplierQuotes).values({ id: quote.id, roundId: round.id, supplierId: quote.supplierId, totalKobo: quote.totalKobo, deliveryHours: quote.deliveryHours, trustBps: quote.trustBps, scoreBps: quote.scoreBps, eligible: quote.eligible, reasons: quote.reasons, items: quote.items, supplierNote: quote.note, submittedAt: new Date(round.startedAt) }).onConflictDoUpdate({ target: schema.supplierQuotes.id, set: { totalKobo: quote.totalKobo, scoreBps: quote.scoreBps, eligible: quote.eligible, reasons: quote.reasons, items: quote.items } });
    }
    if (round.attack) {
      await tx.insert(schema.supplierProfiles).values({ id: "night-market-direct", name: round.attack.supplier, verified: false, trustBps: 1000, evidence: "Unverified attack fixture" }).onConflictDoNothing();
      await tx.insert(schema.supplierQuotes).values({ id: `${round.id}-quote-night-market`, roundId: round.id, supplierId: "night-market-direct", totalKobo: round.attack.quoteTotalKobo, deliveryHours: 2, trustBps: 1000, scoreBps: 9980, eligible: false, reasons: round.attack.reasons, items: [], supplierNote: "Untrusted instructions ignored.", submittedAt: new Date(round.attack.submittedAt) }).onConflictDoNothing();
    }

    for (const shop of round.shops) {
      await tx.insert(schema.roundParticipants).values({ roundId: round.id, merchantId: shop.id, requestId: shop.requestId, allocationKobo: shop.orderTotalKobo, baselineKobo: shop.baselineKobo, savedKobo: shop.savedKobo, paymentStatus: shop.paymentStatus }).onConflictDoUpdate({ target: [schema.roundParticipants.roundId, schema.roundParticipants.merchantId], set: { allocationKobo: shop.orderTotalKobo, baselineKobo: shop.baselineKobo, savedKobo: shop.savedKobo, paymentStatus: shop.paymentStatus } });
    }

    const decisionId = `decision-${round.id}-${state.merchantId}`;
    await tx.insert(schema.policyDecisions).values({ id: decisionId, roundId: round.id, merchantId: state.merchantId, quoteId: round.selectedQuoteId ?? null, decision: round.decision.decision, policyVersion: round.decision.policyVersion, reasons: round.decision.reasons, evaluatedAt: new Date(round.decision.evaluatedAt) }).onConflictDoNothing();

    for (const payment of round.payments) {
      const approvalId = payment.approvalId ?? `approval-${round.id}-${payment.merchantId}`;
      const paymentId = `payment-${round.id}-${payment.merchantId}`;
      await tx.insert(schema.approvalRecords).values({ id: approvalId, roundId: round.id, merchantId: payment.merchantId, status: payment.status === "simulated" ? "approved" : payment.status === "blocked" ? "blocked" : "pending", paymentFingerprint: payment.fingerprint, expiresAt: new Date(payment.expiresAt), approvedAt: payment.status === "simulated" ? now : null }).onConflictDoUpdate({ target: [schema.approvalRecords.roundId, schema.approvalRecords.merchantId], set: { status: payment.status === "simulated" ? "approved" : payment.status === "blocked" ? "blocked" : "pending", paymentFingerprint: payment.fingerprint, expiresAt: new Date(payment.expiresAt), approvedAt: payment.status === "simulated" ? now : null } });
      await tx.insert(schema.paymentIntents).values({ id: paymentId, roundId: round.id, merchantId: payment.merchantId, approvalId, amountKobo: payment.amountKobo, currency: payment.currency, recipient: payment.recipient, status: payment.status, paymentFingerprint: payment.fingerprint, idempotencyKey: paymentId, expiresAt: new Date(payment.expiresAt) }).onConflictDoUpdate({ target: [schema.paymentIntents.roundId, schema.paymentIntents.merchantId], set: { approvalId, status: payment.status, amountKobo: payment.amountKobo, recipient: payment.recipient, paymentFingerprint: payment.fingerprint } });
      if (payment.status === "simulated" && payment.receiptId) {
        await tx.insert(schema.settlementReceipts).values({ id: payment.receiptId, paymentIntentId: paymentId, status: "simulated", transactionHash: null, transactionUrl: null, issuedAt: payment.recordedAt ? new Date(payment.recordedAt) : now, metadata: { adapter: "simulator", notice: "No funds moved." } }).onConflictDoNothing();
      }
    }

    for (const event of state.events) {
      await tx.insert(schema.auditEvents).values({ id: event.id, merchantId: event.merchantId ?? null, roundId: event.roundId ?? null, eventType: event.type, summary: event.summary, metadata: {}, createdAt: new Date(event.at) }).onConflictDoNothing();
    }
    for (const action of idempotency ? Array.isArray(idempotency) ? idempotency : [idempotency] : []) {
      await tx.insert(schema.actionIdempotencyKeys).values({
        id: `${action.scope}-${createHash("sha256").update(action.key).digest("hex")}`,
        scope: action.scope,
        key: action.key,
        resultId: completedActionResult(action.requestHash, round.id),
      }).onConflictDoUpdate({
        target: [schema.actionIdempotencyKeys.scope, schema.actionIdempotencyKeys.key],
        set: { resultId: completedActionResult(action.requestHash, round.id) },
      });
    }

    await tx.insert(schema.dashboardSnapshots).values({ merchantId: state.merchantId, state, updatedAt: now }).onConflictDoUpdate({ target: schema.dashboardSnapshots.merchantId, set: { state, updatedAt: now } });
  });
}
