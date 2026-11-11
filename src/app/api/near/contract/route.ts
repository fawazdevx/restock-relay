import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardRead } from "@/server/http";

export const dynamic = "force-dynamic";

const TESTNET_RPC = "https://test.rpc.fastnear.com";
const accountPattern = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/;

const rpcResponseSchema = z.object({
  result: z.object({
    result: z.array(z.number().int().min(0).max(255)).max(16_384),
    block_height: z.number().int().nonnegative().optional(),
    block_hash: z.string().max(128).optional(),
  }).optional(),
  error: z.object({ message: z.string().max(2_000).optional(), data: z.unknown().optional() }).optional(),
}).passthrough();

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const accountIdSchema = z.string().min(1).max(64).regex(accountPattern);
const contractStatusSchema = z.object({
  owner_id: accountIdSchema,
  emergency_stop: z.boolean(),
  next_round_number: z.string().regex(/^\d+$/),
  current_round: z.object({
    round_number: z.string().regex(/^\d+$/),
    creator_id: accountIdSchema,
    result_hash: hashSchema,
    created_at_ns: z.string().regex(/^\d+$/),
    expires_at_ns: z.string().regex(/^\d+$/),
    status: z.enum(["awaiting_approvals", "authorized", "cancelled", "expired"]),
    approvals_count: z.number().int().min(0).max(5),
    participants: z.array(z.object({
      account_id: accountIdSchema,
      allocation_hash: hashSchema,
      approved: z.boolean(),
      approved_at_ns: z.string().regex(/^\d+$/).nullable(),
    }).strict()).min(1).max(5),
  }).strict().nullable(),
}).strict();

export async function GET(request: NextRequest) {
  const denied = guardRead(request);
  if (denied) return denied;

  const method = request.nextUrl.searchParams.get("method");
  if (method !== "get_status") {
    return NextResponse.json({ error: "Only the Restock Relay status view is available." }, { status: 400 });
  }

  const contractId = process.env.NEXT_PUBLIC_NEAR_TESTNET_CONTRACT_ID;
  if (!contractId || !accountIdSchema.safeParse(contractId).success) {
    return NextResponse.json({ error: "Set NEXT_PUBLIC_NEAR_TESTNET_CONTRACT_ID to the deployed .testnet contract account." }, { status: 503 });
  }

  try {
    const response = await fetch(TESTNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "restock-relay-status",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: contractId,
          method_name: "get_status",
          args_base64: Buffer.from("{}", "utf8").toString("base64"),
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const rpcParsed = rpcResponseSchema.safeParse(await response.json());
    if (!rpcParsed.success || !response.ok || rpcParsed.data.error) {
      return NextResponse.json({ error: "The NEAR testnet RPC could not read the contract. Check the contract account and retry." }, { status: 502 });
    }
    if (!rpcParsed.data.result?.result) {
      return NextResponse.json({ error: "The contract did not return a status. Confirm it is deployed and initialized." }, { status: 502 });
    }

    const resultText = new TextDecoder().decode(new Uint8Array(rpcParsed.data.result.result));
    const contractParsed = contractStatusSchema.safeParse(JSON.parse(resultText));
    if (!contractParsed.success) {
      return NextResponse.json({ error: "The testnet contract returned an unexpected status. Check the deployed contract version." }, { status: 502 });
    }
    return NextResponse.json({ result: contractParsed.data, blockHeight: rpcParsed.data.result.block_height, blockHash: rpcParsed.data.result.block_hash }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the free NEAR testnet RPC. Retry in a moment." }, { status: 502 });
  }
}
