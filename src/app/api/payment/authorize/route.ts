import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizePayment } from "@/core/simulation";
import { paymentAdapter } from "@/core/payments/adapter";
import { actionRequestHash, claimAction, commitDashboardState, loadDashboardState, refreshDashboardState, releaseAction, withDashboardMutationLock } from "@/server/store";
import { guardMutation, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";
const schema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().min(8).max(100),
}).strict();
export async function POST(request: NextRequest) {
  const denied = guardMutation(request);
  if (denied) return denied;
  return withDashboardMutationLock(async () => {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: "Approval details are invalid." }, { status: 400 });
    const current = await loadDashboardState();
    const payment = current.round.payments.find((item) => item.merchantId === current.merchantId);
    if (!payment || payment.fingerprint !== parsed.data.fingerprint) return NextResponse.json({ error: "The frozen payment details no longer match. Review the current quote and request a fresh approval." }, { status: 409 });
    if (payment.status === "simulated") return NextResponse.json(current, { headers: { "Cache-Control": "no-store" } });
    const next = authorizePayment(current, current.merchantId, parsed.data.idempotencyKey, parsed.data.fingerprint);

    const requestHash = actionRequestHash({ fingerprint: parsed.data.fingerprint });
    const requestAction = { scope: "payment", key: parsed.data.idempotencyKey, requestHash };
    const requestClaim = await claimAction(requestAction.scope, requestAction.key, requestHash);
    if (requestClaim === "complete") return NextResponse.json(await refreshDashboardState(), { headers: { "Cache-Control": "no-store" } });
    if (requestClaim !== "claimed") return NextResponse.json({ error: requestClaim === "pending" ? "This approval is already being recorded. Refresh the receipt before retrying." : "This idempotency key is bound to different payment details. Start again with a fresh key." }, { status: 409, headers: { "Cache-Control": "no-store" } });

    // The stable round/shop claim prevents a second execution even if the caller retries with a new key.
    const intentAction = { scope: "payment-intent", key: `${current.round.id}:${current.merchantId}`, requestHash: payment.fingerprint };
    const intentClaim = await claimAction(intentAction.scope, intentAction.key, intentAction.requestHash);
    if (intentClaim === "complete") {
      await releaseAction(requestAction.scope, requestAction.key, requestAction.requestHash);
      return NextResponse.json(await refreshDashboardState(), { headers: { "Cache-Control": "no-store" } });
    }
    if (intentClaim !== "claimed") {
      await releaseAction(requestAction.scope, requestAction.key, requestAction.requestHash);
      return NextResponse.json({ error: intentClaim === "pending" ? "This shop’s approval is already processing. Refresh the receipt before retrying." : "The frozen payment details conflict with an earlier approval attempt. Run a fresh procurement round." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    const execution = await paymentAdapter.execute(payment);
    if (execution.status !== "simulated" || execution.transactionHash !== null || execution.transactionUrl !== null) {
      return NextResponse.json({ error: "The configured payment adapter returned a result this prototype cannot safely record." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const state = await commitDashboardState(next, [requestAction, intentAction]);
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error, "The approval could not be recorded. Review the payment details and try again."); }
  });
}
