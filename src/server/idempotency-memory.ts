export type ActionClaim = "claimed" | "complete" | "pending" | "conflict";

type ActionRecord = {
  requestHash: string;
  state: "pending" | "complete";
  resultId?: string;
  createdAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __restockMemoryIdempotency: Map<string, ActionRecord> | undefined;
}

function records() {
  return (globalThis.__restockMemoryIdempotency ??= new Map());
}

function recordKey(scope: string, key: string) {
  return `${scope}:${key}`;
}

export function claimMemoryAction(scope: string, key: string, requestHash: string): ActionClaim {
  const map = records();
  const id = recordKey(scope, key);
  const previous = map.get(id);
  if (!previous) {
    map.set(id, { requestHash, state: "pending", createdAt: Date.now() });
    if (map.size > 1_000) {
      for (const [oldId, value] of map) {
        if (value.state === "complete") map.delete(oldId);
        if (map.size <= 800) break;
      }
    }
    return "claimed";
  }
  if (previous.requestHash !== requestHash) return "conflict";
  return previous.state === "complete" ? "complete" : "pending";
}

export function completeMemoryAction(scope: string, key: string, requestHash: string, resultId: string): void {
  const map = records();
  const id = recordKey(scope, key);
  const previous = map.get(id);
  if (!previous || previous.requestHash !== requestHash) return;
  map.set(id, { ...previous, state: "complete", resultId });
}

export function releaseMemoryAction(scope: string, key: string, requestHash: string): void {
  const map = records();
  const id = recordKey(scope, key);
  const previous = map.get(id);
  if (previous?.state === "pending" && previous.requestHash === requestHash) map.delete(id);
}
