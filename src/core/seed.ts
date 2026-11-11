import type { DashboardState, MerchantPolicy, ProcurementRound, RestockRequest } from "@/core/types";

export const DEMO_MERCHANT_ID = "merchant-yaba-01";

export const seedPolicy: MerchantPolicy = {
  merchantId: DEMO_MERCHANT_ID,
  merchantName: "Amina’s Corner",
  version: "RR-POL-03",
  maxOrderKobo: "18000000",
  dailyCapKobo: "35000000",
  maxUnitKobo: "2500000",
  allowedSuppliers: ["lagos-fresh", "grain-house", "mainland-cash"],
  allowedTokens: ["NGN"],
  allowedRecipients: ["Lagos Fresh Produce Ltd", "Grain House Cooperative", "Mainland Cash & Carry"],
  approvalThresholdKobo: "1000000",
  autoApproveBelowKobo: "0",
  emergencyStop: false,
};

export const seedRequests: RestockRequest[] = [
  {
    id: "req-yaba-041",
    merchantId: DEMO_MERCHANT_ID,
    merchantName: "Amina’s Corner",
    title: "Friday produce + pantry restock",
    items: [
      { id: "tomato", name: "Tomatoes", quantity: 4, unit: "crates", maxUnitPriceKobo: "185000" },
      { id: "rice", name: "Ofada rice", quantity: 1, unit: "25 kg bags", maxUnitPriceKobo: "2500000" },
      { id: "pepper", name: "Scotch bonnet", quantity: 2, unit: "baskets", maxUnitPriceKobo: "950000" },
    ],
    maxTotalKobo: "6500000",
    maxUnitPriceKobo: "2500000",
    deadline: "Friday, 10:30 AM",
    allowedSuppliers: ["lagos-fresh", "grain-house", "mainland-cash"],
    approvalThresholdKobo: "1000000",
  },
  {
    id: "req-yaba-038",
    merchantId: "merchant-surulere-02",
    merchantName: "Tola Foods",
    title: "Friday produce + pantry restock",
    items: [
      { id: "tomato", name: "Tomatoes", quantity: 3, unit: "crates", maxUnitPriceKobo: "185000" },
      { id: "rice", name: "Ofada rice", quantity: 1, unit: "25 kg bags", maxUnitPriceKobo: "2500000" },
      { id: "pepper", name: "Scotch bonnet", quantity: 2, unit: "baskets", maxUnitPriceKobo: "950000" },
    ],
    maxTotalKobo: "6300000",
    maxUnitPriceKobo: "2500000",
    deadline: "Friday, 10:30 AM",
    allowedSuppliers: ["lagos-fresh", "grain-house"],
    approvalThresholdKobo: "900000",
  },
  {
    id: "req-surulere-012",
    merchantId: "merchant-surulere-02",
    merchantName: "Tola Foods",
    title: "Fresh produce for the lunch rush",
    items: [
      { id: "onion", name: "Red onions", quantity: 4, unit: "sacks", maxUnitPriceKobo: "145000" },
      { id: "plantain", name: "Ripe plantain", quantity: 6, unit: "bunches", maxUnitPriceKobo: "78000" },
    ],
    maxTotalKobo: "4300000",
    maxUnitPriceKobo: "145000",
    deadline: "Friday, 11:00 AM",
    allowedSuppliers: ["lagos-fresh", "mainland-cash"],
    approvalThresholdKobo: "900000",
  },
  {
    id: "req-yaba-044",
    merchantId: "merchant-yaba-03",
    merchantName: "Bisi Mini Mart",
    title: "Friday produce + pantry restock",
    items: [
      { id: "tomato", name: "Tomatoes", quantity: 3, unit: "crates", maxUnitPriceKobo: "185000" },
      { id: "rice", name: "Ofada rice", quantity: 1, unit: "25 kg bags", maxUnitPriceKobo: "2500000" },
      { id: "pepper", name: "Scotch bonnet", quantity: 1, unit: "baskets", maxUnitPriceKobo: "950000" },
    ],
    maxTotalKobo: "5100000",
    maxUnitPriceKobo: "2500000",
    deadline: "Friday, 10:30 AM",
    allowedSuppliers: ["lagos-fresh", "grain-house"],
    approvalThresholdKobo: "750000",
  },
];

function emptyRound(): ProcurementRound {
  return {
    id: "round-rr-018",
    number: "RR-018",
    status: "ready",
    mode: "demo",
    scenario: "standard",
    startedAt: new Date("2026-11-03T08:42:00.000Z").toISOString(),
    title: "Friday produce + pantry restock",
    ordersCount: 3,
    buyerAgents: 20,
    supplierAgents: 5,
    shops: [
      { id: DEMO_MERCHANT_ID, name: "Amina’s Corner", area: "Yaba", initials: "AC", accent: "blue", orderTotalKobo: "0", baselineKobo: "0", savedKobo: "0", paymentStatus: "awaiting_approval", requestId: "req-yaba-041" },
      { id: "merchant-surulere-02", name: "Tola Foods", area: "Surulere", initials: "TF", accent: "citrus", orderTotalKobo: "0", baselineKobo: "0", savedKobo: "0", paymentStatus: "awaiting_approval", requestId: "req-yaba-038" },
      { id: "merchant-yaba-03", name: "Bisi Mini Mart", area: "Yaba", initials: "BM", accent: "green", orderTotalKobo: "0", baselineKobo: "0", savedKobo: "0", paymentStatus: "awaiting_approval", requestId: "req-yaba-044" },
    ],
    buyerActivity: [],
    quotes: [],
    decision: { decision: "allow", policyVersion: "RR-POL-03", reasons: [], evaluatedAt: new Date("2026-11-03T08:42:00.000Z").toISOString() },
    savingsKobo: "0",
    baselineKobo: "0",
    pooledTotalKobo: "0",
    payments: [],
  };
}

export function createSeedState(): DashboardState {
  return {
    merchantId: DEMO_MERCHANT_ID,
    merchantName: seedPolicy.merchantName,
    policy: structuredClone(seedPolicy),
    requests: structuredClone(seedRequests),
    round: emptyRound(),
    events: [
      { id: "evt-001", type: "round.ready", merchantId: DEMO_MERCHANT_ID, roundId: "round-rr-018", at: "2026-11-03T08:42:00.000Z", summary: "Round RR-018 is ready to coordinate compatible demand." },
      { id: "evt-002", type: "policy.loaded", merchantId: DEMO_MERCHANT_ID, at: "2026-11-03T08:42:00.000Z", summary: "Purchasing policy RR-POL-03 loaded." },
    ],
    dailySpendKobo: "0",
    agentCount: { buyers: 20, suppliers: 5 },
    storage: process.env.DATABASE_URL ? "postgres" : "memory",
  };
}
