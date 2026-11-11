import { NextResponse } from "next/server";
import { loadDashboardState } from "@/server/store";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await loadDashboardState();
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const response = jsonError(error, "The buying desk cannot reach its database. Check the Supabase connection string and choose a connection mode reachable from this network.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
