import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createMerchantRequest } from "@/core/simulation";
import { commitDashboardState, loadDashboardState, withDashboardMutationLock } from "@/server/store";
import { guardMutation, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

const amount = z.string().regex(/^\d{1,12}$/, "Use a whole-number amount in kobo.");
const schema = z.object({
  title: z.string().trim().min(4).max(100),
  items: z.array(z.object({
    id: z.string().trim().min(1).max(32),
    name: z.string().trim().min(2).max(80),
    quantity: z.number().int().min(1).max(500),
    unit: z.string().trim().min(1).max(32),
    maxUnitPriceKobo: amount,
  }).strict()).min(1).max(12),
  maxTotalKobo: amount,
  maxUnitPriceKobo: amount,
  deadline: z.string().trim().min(3).max(80),
  allowedSuppliers: z.array(z.enum(["lagos-fresh", "grain-house", "mainland-cash"])).min(1).max(3),
  approvalThresholdKobo: amount,
}).strict();

export async function POST(request: NextRequest) {
  const denied = guardMutation(request);
  if (denied) return denied;
  return withDashboardMutationLock(async () => {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return NextResponse.json({ error: "Check the highlighted request fields.", details: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) }, { status: 400 });
    const current = await loadDashboardState();
    const requestInput = { ...parsed.data, allowedSuppliers: [...new Set(parsed.data.allowedSuppliers)] };
    const state = await commitDashboardState(createMerchantRequest(requestInput, current));
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error, "The restock request could not be saved. Check the database connection and try again."); }
  });
}
