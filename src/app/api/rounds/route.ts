import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runProcurementRound } from "@/core/simulation";
import { actionRequestHash, claimAction, commitDashboardState, loadDashboardState, refreshDashboardState, resetDashboardState, withDashboardMutationLock } from "@/server/store";
import { guardMutation, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["run", "reset"]),
  mode: z.enum(["demo", "merchant"]).optional(),
  scenario: z.enum(["standard", "supplier_withdrawal"]).optional(),
  requestId: z.string().max(120).optional(),
  idempotencyKey: z.string().min(8).max(100),
}).strict();

export async function POST(request: NextRequest) {
  const denied = guardMutation(request);
  if (denied) return denied;
  return withDashboardMutationLock(async () => {
  try {
    const parsed = actionSchema.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: "Round action is invalid.", details: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) }, { status: 400 });
    const input = parsed.data;
    const scenario = input.scenario ?? "standard";
    if (scenario === "supplier_withdrawal" && ((input.mode ?? "demo") !== "demo" || input.requestId)) {
      return NextResponse.json({ error: "The supplier withdrawal scenario is available for the seeded demo round only." }, { status: 400 });
    }
    const requestHash = actionRequestHash({ action: input.action, mode: input.mode ?? "demo", requestId: input.requestId ?? null, scenario });

    if (input.action === "reset") {
      const claim = await claimAction("round", input.idempotencyKey, requestHash);
      if (claim === "complete") return NextResponse.json(await refreshDashboardState(), { headers: { "Cache-Control": "no-store" } });
      if (claim !== "claimed") {
        const message = claim === "pending" ? "This reset is already being recorded. Refresh the buying desk before retrying." : "This idempotency key was already used for a different round action. Start again with a fresh key.";
        return NextResponse.json({ error: message }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
      const state = await resetDashboardState({ scope: "round", key: input.idempotencyKey, requestHash });
      return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
    }
    const current = await loadDashboardState();
    if (current.policy.emergencyStop) return NextResponse.json({ error: "Emergency stop is on. Turn it off before starting a procurement round." }, { status: 409 });
    const requestDraft = input.requestId ? current.requests.find((item) => item.id === input.requestId && item.merchantId === current.merchantId) : undefined;
    if (input.requestId && !requestDraft) return NextResponse.json({ error: "That restock request is not available to this merchant." }, { status: 404 });
    const claim = await claimAction("round", input.idempotencyKey, requestHash);
    if (claim === "complete") return NextResponse.json(await refreshDashboardState(), { headers: { "Cache-Control": "no-store" } });
    if (claim !== "claimed") {
      const message = claim === "pending" ? "This round action is already being processed. Refresh the buying desk before retrying." : "This idempotency key was already used for a different round action. Start again with a fresh key.";
      return NextResponse.json({ error: message }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const next = runProcurementRound(current, input.mode ?? "demo", requestDraft, scenario);
    const state = await commitDashboardState(next, { scope: "round", key: input.idempotencyKey, requestHash });
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error, "The procurement round could not be completed. Check the database connection and try again.");
  }
  });
}
