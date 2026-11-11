import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { simulateAttack } from "@/core/simulation";
import { actionRequestHash, claimAction, commitDashboardState, loadDashboardState, refreshDashboardState, withDashboardMutationLock } from "@/server/store";
import { guardMutation, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";
const schema = z.object({ idempotencyKey: z.string().min(8).max(100) }).strict();
export async function POST(request: NextRequest) {
  const denied = guardMutation(request);
  if (denied) return denied;
  return withDashboardMutationLock(async () => {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: "Attack demo request is invalid." }, { status: 400 });
    const requestHash = actionRequestHash({ action: "simulate-attack" });
    const claim = await claimAction("attack", parsed.data.idempotencyKey, requestHash);
    if (claim === "complete") return NextResponse.json(await refreshDashboardState(), { headers: { "Cache-Control": "no-store" } });
    if (claim !== "claimed") return NextResponse.json({ error: claim === "pending" ? "The supplier attack demonstration is already being recorded. Refresh before trying again." : "This idempotency key was already used for another action. Start again with a fresh key." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    const state = await commitDashboardState(simulateAttack(await loadDashboardState()), { scope: "attack", key: parsed.data.idempotencyKey, requestHash });
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error, "The security demo could not be completed. Refresh the page and try again."); }
  });
}
