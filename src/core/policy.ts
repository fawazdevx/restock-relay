import type { MerchantPolicy, PolicyDecision, Quote, RestockRequest } from "@/core/types";

export function evaluateQuote(
  policy: MerchantPolicy,
  requests: RestockRequest[],
  quote: Quote,
  pooledTotalKobo: string,
  now = new Date(),
  merchantAllocationKobo = pooledTotalKobo,
  dailySpendKobo = "0",
  merchantAllocationsKobo: string[] = [],
): PolicyDecision {
  const reasons: PolicyDecision["reasons"] = [];
  const supplier = quote.supplierId;
  const budget = requests.reduce((sum, request) => sum + BigInt(request.maxTotalKobo), 0n);
  const quoteTotal = BigInt(pooledTotalKobo);
  const cappedTotal = policy.maxOrderKobo;
  const expectedLineCount = requests.reduce((sum, request) => sum + request.items.length, 0);
  if (quote.items.length !== expectedLineCount || expectedLineCount === 0) reasons.push({ code: "QUOTE_LINES_MISSING", message: "The supplier quote does not itemize every requested line." });
  let itemizedTotal = 0n;
  for (const line of quote.items) {
    const request = requests.find((item) => item.id === line.requestId && item.merchantId === line.merchantId);
    const requestedItem = request?.items.find((item) => item.id === line.itemId);
    const lineTotal = BigInt(line.unitPriceKobo) * BigInt(line.quantity);
    itemizedTotal += BigInt(line.totalKobo);
    if (!request || !requestedItem || line.quantity !== requestedItem.quantity || line.unit !== requestedItem.unit || line.maxUnitPriceKobo !== requestedItem.maxUnitPriceKobo || BigInt(line.totalKobo) !== lineTotal) {
      reasons.push({ code: "QUOTE_LINE_MISMATCH", message: "A supplier quote line does not match the merchant’s frozen request." });
      continue;
    }
    if (BigInt(line.unitPriceKobo) > BigInt(requestedItem.maxUnitPriceKobo)) {
      reasons.push({ code: "REQUEST_ITEM_PRICE_CAP", message: `${request.merchantName} has a quoted unit price above its line item limit.` });
    }
    if (line.merchantId === policy.merchantId && BigInt(line.unitPriceKobo) > BigInt(policy.maxUnitKobo)) {
      reasons.push({ code: "ITEM_PRICE_CAP", message: `${request.merchantName} has a quoted unit price above the account’s maximum unit price.` });
    }
  }
  if (itemizedTotal !== quoteTotal) reasons.push({ code: "QUOTE_TOTAL_MISMATCH", message: "The supplier’s itemized lines do not add up to its pooled total." });

  if (policy.emergencyStop) reasons.push({ code: "KILL_SWITCH", message: "Emergency stop is on. New approvals and payment execution are paused." });
  if (quoteTotal > budget) reasons.push({ code: "POOL_BUDGET", message: "The pooled quote is above the combined merchant budgets." });
  if (BigInt(merchantAllocationKobo) > BigInt(cappedTotal)) reasons.push({ code: "ORDER_CAP", message: "This shop’s allocated share exceeds its per-order cap." });
  if (BigInt(dailySpendKobo) + BigInt(merchantAllocationKobo) > BigInt(policy.dailyCapKobo)) reasons.push({ code: "DAILY_CAP", message: "This allocation would exceed the shop’s remaining daily spend cap." });
  if (!policy.allowedSuppliers.includes(supplier)) reasons.push({ code: "SUPPLIER_NOT_ALLOWED", message: `${quote.supplierName} is not on this merchant’s supplier allowlist.` });
  if (!policy.allowedTokens.includes("NGN")) reasons.push({ code: "TOKEN_NOT_ALLOWED", message: "NGN is not on this merchant’s payment token allowlist." });
  if (!policy.allowedRecipients.includes(quote.supplierName)) reasons.push({ code: "RECIPIENT_NOT_ALLOWED", message: "The payment recipient is not on the merchant’s recipient allowlist." });
  if (quote.untrustedText) reasons.push({ code: "UNTRUSTED_INSTRUCTIONS", message: "Supplier note contained instructions. It was treated as data and ignored." });

  for (const [index, request] of requests.entries()) {
    if (request.items.some((item) => BigInt(item.maxUnitPriceKobo) > BigInt(request.maxUnitPriceKobo))) {
      reasons.push({ code: "REQUEST_ITEM_CAP", message: `${request.merchantName} has a line item above its request-level unit price cap.` });
    }
    if (request.items.some((item) => BigInt(item.maxUnitPriceKobo) <= 0n)) {
      reasons.push({ code: "INVALID_ITEM_PRICE", message: `${request.merchantName} has a line item without a positive unit price limit.` });
    }
    if (request.merchantId === policy.merchantId) {
      if (BigInt(request.maxTotalKobo) > BigInt(policy.maxOrderKobo)) {
        reasons.push({ code: "MERCHANT_CAP", message: `${request.merchantName}’s request exceeds the account’s configured order cap.` });
      }
      if (request.items.some((item) => BigInt(item.maxUnitPriceKobo) > BigInt(policy.maxUnitKobo))) {
        reasons.push({ code: "ITEM_PRICE_CAP", message: `${request.merchantName} has a line item above the account’s maximum unit price.` });
      }
    }
    const allocation = merchantAllocationsKobo[index];
    if (allocation !== undefined && BigInt(allocation) > BigInt(request.maxTotalKobo)) {
      reasons.push({ code: "REQUEST_TOTAL_CAP", message: `${request.merchantName}’s allocated share exceeds its request maximum.` });
    }
  }

  const hardBlocks = reasons.filter((reason) => reason.code !== "UNTRUSTED_INSTRUCTIONS");
  const decision = hardBlocks.length ? "block" : reasons.length ? "warn" : "allow";
  return {
    decision,
    policyVersion: policy.version,
    reasons,
    evaluatedAt: now.toISOString(),
  };
}

export function evaluateAttack(policy: MerchantPolicy, quote: Quote, roundSpendKobo: string): string[] {
  const reasons: string[] = [];
  if (!policy.allowedSuppliers.includes(quote.supplierId)) reasons.push(`${quote.supplierName} is not an approved supplier.`);
  if (!policy.allowedTokens.includes("NGN")) reasons.push("NGN is not on the payment token allowlist.");
  if (!policy.allowedRecipients.includes(quote.supplierName)) reasons.push("Payment recipient is not allowlisted.");
  if (BigInt(quote.totalKobo) > BigInt(policy.maxOrderKobo)) reasons.push("Quote is above the merchant’s per-order cap.");
  if (BigInt(quote.totalKobo) > BigInt(roundSpendKobo)) reasons.push("Quote is above the pooled maximum spend.");
  if (quote.untrustedText) reasons.push("Supplier text is untrusted input; embedded instructions cannot change agent rules.");
  if (policy.emergencyStop) reasons.push("Emergency stop is on; approval and execution are disabled.");
  return reasons;
}
