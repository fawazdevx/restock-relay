import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

assert.ok(existsSync(path.join(projectRoot, ".next", "BUILD_ID")), "run `npm run build` before the HTTP flow test");

const port = await unusedPort();
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: projectRoot,
  env: { ...process.env, DATABASE_URL: "", APP_ORIGIN: origin, NEXT_PUBLIC_NEAR_TESTNET_CONTRACT_ID: "" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
child.stdout.setEncoding("utf8").on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-12_000); });
child.stderr.setEncoding("utf8").on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-12_000); });

async function waitForServer() {
  const deadline = Date.now() + 90_000;
  let lastError;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${origin}/api/dashboard`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = new Error(`dashboard returned HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await delay(350);
  }
  throw new Error(`Next.js did not become ready: ${lastError?.message ?? "process exited"}\n${serverOutput}`);
}

async function post(route, body, requestOrigin = origin) {
  return fetch(`${origin}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(requestOrigin ? { origin: requestOrigin } : {}) },
    body: JSON.stringify(body),
  });
}

try {
  await waitForServer();

  const page = await fetch(origin);
  const pageHtml = await page.text();
  assert.equal(page.status, 200, "the landing page should load");
  assert.match(pageHtml, /Restock Relay/i, "the landing page should identify the product");

  const initial = await (await fetch(`${origin}/api/dashboard`)).json();
  assert.equal(initial.storage, "memory", "the test server must not use the developer database");

  const roundKey = "e2e-round-seeded-001";
  const runResponse = await post("/api/rounds", { action: "run", mode: "demo", idempotencyKey: roundKey });
  assert.equal(runResponse.status, 200, `seeded round should run: ${await runResponse.clone().text()}`);
  const run = await runResponse.json();
  assert.equal(run.round.buyerActivity.length, 20);
  assert.equal(run.round.quotes.length, 5);
  assert.equal(run.round.shops.length, 3);
  assert.ok(run.round.selectedQuoteId, "an eligible offer should be selected");

  const replay = await post("/api/rounds", { action: "run", mode: "demo", idempotencyKey: roundKey });
  assert.equal(replay.status, 200, "repeating the same round request should return its result");
  assert.equal((await replay.json()).round.id, run.round.id, "a retry must not create another round");

  const conflict = await post("/api/rounds", { action: "reset", idempotencyKey: roundKey });
  assert.equal(conflict.status, 409, "reusing an idempotency key for a different action must be rejected");

  const payment = run.round.payments.find((item) => item.merchantId === run.merchantId);
  assert.ok(payment, "the signed-in demo shop should have its own frozen allocation");
  const beforeSpend = BigInt(run.dailySpendKobo);
  const paymentBody = { fingerprint: payment.fingerprint, idempotencyKey: "e2e-payment-001" };
  const authorizeResponse = await post("/api/payment/authorize", paymentBody);
  assert.equal(authorizeResponse.status, 200, `demo authorization should complete: ${await authorizeResponse.clone().text()}`);
  const authorized = await authorizeResponse.json();
  const authorizedPayment = authorized.round.payments.find((item) => item.merchantId === run.merchantId);
  assert.equal(authorizedPayment.status, "simulated");
  assert.equal(authorizedPayment.transactionHash ?? null, null, "a simulated receipt must not invent a transaction hash");
  assert.equal(BigInt(authorized.dailySpendKobo), beforeSpend + BigInt(payment.amountKobo));
  assert.equal(authorized.events.filter((event) => event.type === "payment.simulated").length, 1);

  const paymentRetry = await post("/api/payment/authorize", { ...paymentBody, idempotencyKey: "e2e-payment-retry-002" });
  assert.equal(paymentRetry.status, 200);
  const retriedState = await paymentRetry.json();
  assert.equal(retriedState.dailySpendKobo, authorized.dailySpendKobo, "retrying with a new key must not count or execute twice");
  assert.equal(retriedState.events.filter((event) => event.type === "payment.simulated").length, 1);

  const attackResponse = await post("/api/attack", { idempotencyKey: "e2e-attack-001" });
  assert.equal(attackResponse.status, 200);
  const attacked = await attackResponse.json();
  assert.equal(attacked.round.attack.blocked, true);
  assert.ok(attacked.round.attack.reasons.length > 0, "the blocked attack should explain why it failed");

  const disruptionKey = "e2e-round-supplier-withdrawal-001";
  const disruptionResponse = await post("/api/rounds", { action: "run", mode: "demo", scenario: "supplier_withdrawal", idempotencyKey: disruptionKey });
  assert.equal(disruptionResponse.status, 200, `supplier withdrawal scenario should run: ${await disruptionResponse.clone().text()}`);
  const disrupted = await disruptionResponse.json();
  const withdrawn = disrupted.round.quotes.find((quote) => quote.supplierId === "lagos-fresh");
  const disruptionWinner = disrupted.round.quotes.find((quote) => quote.id === disrupted.round.selectedQuoteId);
  assert.equal(disrupted.round.scenario, "supplier_withdrawal");
  assert.equal(withdrawn.availability, "withdrawn");
  assert.equal(withdrawn.eligible, false);
  assert.equal(disruptionWinner.supplierId, "grain-house");
  assert.equal(disrupted.round.decision.decision, "allow");
  const disruptionRetry = await post("/api/rounds", { action: "run", mode: "demo", scenario: "supplier_withdrawal", idempotencyKey: disruptionKey });
  assert.equal(disruptionRetry.status, 200, "replaying the disruption scenario should return its result");
  assert.equal((await disruptionRetry.json()).round.id, disrupted.round.id, "a retry must not create a second disruption round");

  const invalidDisruption = await post("/api/rounds", { action: "run", mode: "merchant", requestId: "req-yaba-041", scenario: "supplier_withdrawal", idempotencyKey: "e2e-round-invalid-scenario" });
  assert.equal(invalidDisruption.status, 400, "the seeded supply disruption must not be applied to a merchant's custom request");

  const missingOrigin = await post("/api/attack", { idempotencyKey: "e2e-origin-001" }, "");
  assert.equal(missingOrigin.status, 403, "mutations without an Origin must be denied");
  const foreignOrigin = await post("/api/attack", { idempotencyKey: "e2e-origin-002" }, "https://attacker.invalid");
  assert.equal(foreignOrigin.status, 403, "cross-origin mutations must be denied");

  const oversized = await fetch(`${origin}/api/attack`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: " ".repeat(32_001),
  });
  assert.equal(oversized.status, 413, "oversized mutation bodies must be rejected");

  const resetBody = { action: "reset", idempotencyKey: "e2e-reset-cleanup-001" };
  const reset = await post("/api/rounds", resetBody);
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).round.status, "ready");
  const resetRetry = await post("/api/rounds", resetBody);
  assert.equal(resetRetry.status, 200);
  assert.equal((await resetRetry.json()).round.status, "ready");

  process.stdout.write("PASS landing page, seeded buyer/supplier round, simulated supplier withdrawal and rerank, idempotent retries, simulated merchant authorization, blocked attack, origin/body protections, and reset flow\n");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  if (serverOutput) process.stderr.write(`\nNext.js output:\n${serverOutput}\n`);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5_000),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
