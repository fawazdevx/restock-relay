import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { UserFacingError } from "@/core/errors";

declare global {
  // eslint-disable-next-line no-var
  var __restockRateLimit: Map<string, { start: number; count: number }> | undefined;
}

const MAX_BODY_BYTES = 32_000;

function rateLimit(request: NextRequest): NextResponse | null {
  const buckets = (globalThis.__restockRateLimit ??= new Map());
  const now = Date.now();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean);
  const clientIp = request.headers.get("x-real-ip")?.trim() || forwarded?.at(-1) || "local";
  const key = `${clientIp}:${request.nextUrl.pathname}`;
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= 60_000) buckets.set(key, { start: now, count: 1 });
  else if (bucket.count >= 60) return NextResponse.json({ error: "Too many actions in one minute. Wait a moment and try again." }, { status: 429 });
  else bucket.count += 1;
  if (buckets.size > 500) for (const [bucketKey, value] of buckets) if (now - value.start > 60_000) buckets.delete(bucketKey);
  return null;
}

export function guardRead(request: NextRequest): NextResponse | null {
  return rateLimit(request);
}

export function guardMutation(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.json({ error: "A same-origin request is required for this action." }, { status: 403 });

  let parsedOrigin: string;
  let expectedOrigin: string;
  try {
    parsedOrigin = new URL(origin).origin;
    expectedOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : request.nextUrl.origin;
  } catch {
    return NextResponse.json({ error: "The app origin is misconfigured. Check APP_ORIGIN and retry." }, { status: 503 });
  }
  if (parsedOrigin !== expectedOrigin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "This action requires a JSON request body." }, { status: 415 });
  }
  return rateLimit(request);
}

function postgresErrorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 4 || !error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return postgresErrorCode(error.cause, depth + 1);
  return undefined;
}

export function jsonError(error: unknown, fallback = "The action could not be completed. Refresh the page and try again."): NextResponse {
  if (error instanceof UserFacingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const code = postgresErrorCode(error);
  if (code === "28P01") {
    return NextResponse.json({
      error: "Supabase rejected the database login. Replace [YOUR-PASSWORD] in DATABASE_URL with the actual database password, and URL-encode reserved characters.",
    }, { status: 503 });
  }
  if (code === "42P01" || code === "3F000") {
    return NextResponse.json({
      error: "The demo database is missing its tables. From the project folder, run `npm run db:migrate`, then restart the app.",
    }, { status: 503 });
  }

  // Keep database query text, connection strings, and request parameters out of API responses and logs.
  console.error("[restock-relay] An API action failed.", {
    errorType: error instanceof Error ? error.constructor.name : "UnknownError",
  });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function readJson(request: NextRequest): Promise<unknown> {
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new UserFacingError("Request is too large. Keep restock forms below 32 KB.", 413);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new UserFacingError("A JSON request body is required.", 400);
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new UserFacingError("Request is too large. Keep restock forms below 32 KB.", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new UserFacingError("Request body must contain valid JSON.", 400);
  }
}
