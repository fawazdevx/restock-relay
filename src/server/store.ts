import "server-only";
import { createHash } from "node:crypto";
import { createSeedState } from "@/core/seed";
import type { DashboardState } from "@/core/types";
import { configuredStorage, claimStoredAction, persistDashboardState, readDashboardSnapshot, releaseStoredAction } from "@/db";
import { claimMemoryAction, completeMemoryAction, releaseMemoryAction, type ActionClaim } from "@/server/idempotency-memory";

export type { ActionClaim } from "@/server/idempotency-memory";

declare global {
  // eslint-disable-next-line no-var
  var __restockDashboardState: DashboardState | undefined;
  // eslint-disable-next-line no-var
  var __restockDashboardStatePromise: Promise<DashboardState> | undefined;
  // eslint-disable-next-line no-var
  var __restockMutationQueue: Promise<void> | undefined;
}

/** Serialize read/modify/write actions within the single demo server process. */
export async function withDashboardMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = globalThis.__restockMutationQueue ?? Promise.resolve();
  let release!: () => void;
  globalThis.__restockMutationQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export function actionRequestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "null", "utf8").digest("hex");
}

export async function claimAction(scope: string, key: string, requestHash: string): Promise<ActionClaim> {
  if (configuredStorage() === "postgres") return claimStoredAction(scope, key, requestHash);
  return claimMemoryAction(scope, key, requestHash);
}

export async function releaseAction(scope: string, key: string, requestHash: string): Promise<void> {
  if (configuredStorage() === "postgres") return releaseStoredAction(scope, key, requestHash);
  releaseMemoryAction(scope, key, requestHash);
}

export async function loadDashboardState(): Promise<DashboardState> {
  if (globalThis.__restockDashboardState) return globalThis.__restockDashboardState;
  if (!globalThis.__restockDashboardStatePromise) {
    globalThis.__restockDashboardStatePromise = (async () => {
      const seeded = createSeedState();
      if (configuredStorage() === "postgres") {
        const stored = await readDashboardSnapshot(seeded.merchantId);
        if (stored) {
          globalThis.__restockDashboardState = { ...stored, storage: "postgres" };
          return globalThis.__restockDashboardState;
        }
        const initial = { ...seeded, storage: "postgres" as const };
        await persistDashboardState(initial);
        globalThis.__restockDashboardState = initial;
        return initial;
      }
      globalThis.__restockDashboardState = seeded;
      return seeded;
    })();
  }
  return globalThis.__restockDashboardStatePromise;
}

export async function commitDashboardState(next: DashboardState, idempotency?: { scope: string; key: string; requestHash: string } | { scope: string; key: string; requestHash: string }[]): Promise<DashboardState> {
  const stored = { ...next, storage: configuredStorage() } as DashboardState;
  await persistDashboardState(stored, idempotency);
  globalThis.__restockDashboardState = stored;
  for (const action of idempotency ? Array.isArray(idempotency) ? idempotency : [idempotency] : []) {
    completeMemoryAction(action.scope, action.key, action.requestHash, stored.round.id);
  }
  return stored;
}

export async function refreshDashboardState(): Promise<DashboardState> {
  if (configuredStorage() !== "postgres") return loadDashboardState();
  const seeded = createSeedState();
  const stored = await readDashboardSnapshot(seeded.merchantId);
  if (!stored) return loadDashboardState();
  const fresh = { ...stored, storage: "postgres" as const };
  globalThis.__restockDashboardState = fresh;
  globalThis.__restockDashboardStatePromise = Promise.resolve(fresh);
  return fresh;
}

export async function resetDashboardState(idempotency?: { scope: string; key: string; requestHash: string }): Promise<DashboardState> {
  const { createSeedState } = await import("@/core/seed");
  const next = { ...createSeedState(), storage: configuredStorage() } as DashboardState;
  await persistDashboardState(next, idempotency);
  globalThis.__restockDashboardState = next;
  globalThis.__restockDashboardStatePromise = Promise.resolve(next);
  if (idempotency) completeMemoryAction(idempotency.scope, idempotency.key, idempotency.requestHash, next.round.id);
  return next;
}
