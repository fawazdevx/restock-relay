import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toggleKillSwitch } from "@/core/simulation";
import { actionRequestHash, claimAction, commitDashboardState, loadDashboardState, refreshDashboardState, withDashboardMutationLock } from "@/server/store";
import { guardMutation, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";
const schema = z.object({ action: z.literal("toggle-kill-switch"), idempotencyKey: z.string().min(8).max(100) }).strict();
export async function POST(request: NextRequest) {
  const denied = guardMutation(request);
  if (denied) return denied;
  return withDashboardMutationLock(async () => {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: "Policy action is invalid." }, { status: 400 });
    const requestHash = actionRequestHash({ action: parsed.data.action });
    const claim = await claimAction("policy", parsed.data.idempotencyKey, requestHash);
    if (claim === "complete") return NextResponse.json(await refreshDashboardState(), { headers: { "Cache-Control": "no-store" } });
    if (claim !== "claimed") return NextResponse.json({ error: claim === "pending" ? "This safety change is already being recorded. Refresh the page before trying again." : "This idempotency key belongs to a different safety action. Start again with a fresh key." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    const current = await loadDashboardState();
    const state = await commitDashboardState(toggleKillSwitch(current), { scope: "policy", key: parsed.data.idempotencyKey, requestHash });
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error, "The safety setting could not be updated. Refresh the page and try again."); }
  });
}
