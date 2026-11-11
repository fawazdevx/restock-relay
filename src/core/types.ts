export type Decision = "allow" | "warn" | "block";
export type PaymentStatus = "awaiting_approval" | "simulated" | "blocked";
export type RoundStatus = "ready" | "awaiting_approval" | "complete" | "blocked";

export type Shop = {
  id: string;
  name: string;
  area: string;
  initials: string;
  accent: string;
  orderTotalKobo: string;
  baselineKobo: string;
  savedKobo: string;
  paymentStatus: PaymentStatus;
  requestId: string;
};

export type LineItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  maxUnitPriceKobo: string;
};

export type RestockRequest = {
  id: string;
  merchantId: string;
  merchantName: string;
  title: string;
  items: LineItem[];
  maxTotalKobo: string;
  maxUnitPriceKobo: string;
  deadline: string;
  allowedSuppliers: string[];
  approvalThresholdKobo: string;
};

export type Supplier = {
  id: string;
  name: string;
  label: string;
  verified: boolean;
  trustBps: number;
  evidence: string;
  color: string;
};

export type Quote = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierLabel: string;
  totalKobo: string;
  deliveryHours: number;
  trustBps: number;
  trustEvidence: string;
  scoreBps: number;
  eligible: boolean;
  availability?: "available" | "withdrawn";
  reasons: string[];
  note: string;
  items: QuoteLine[];
  untrustedText?: string;
};

export type QuoteLine = {
  merchantId: string;
  merchantName: string;
  requestId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  maxUnitPriceKobo: string;
  unitPriceKobo: string;
  totalKobo: string;
};

export type PolicyReason = { code: string; message: string };

export type PolicyDecision = {
  decision: Decision;
  policyVersion: string;
  reasons: PolicyReason[];
  evaluatedAt: string;
};

export type FrozenPayment = {
  merchantId: string;
  merchantName: string;
  amountKobo: string;
  currency: "NGN";
  recipient: string;
  quoteId: string;
  fingerprint: string;
  expiresAt: string;
  approvalReason: string;
  status: PaymentStatus;
  recordedAt?: string;
  approvalId?: string;
  receiptId?: string;
};

export type BuyerAgentCheck = {
  id: string;
  requestId: string;
  merchantName: string;
  task: string;
  status: "ready" | "held";
  detail: string;
};

export type ProcurementRound = {
  id: string;
  number: string;
  status: RoundStatus;
  mode: "demo" | "attack" | "merchant";
  scenario: "standard" | "supplier_withdrawal";
  startedAt: string;
  completedAt?: string;
  title: string;
  ordersCount: number;
  buyerAgents: number;
  supplierAgents: number;
  shops: Shop[];
  buyerActivity: BuyerAgentCheck[];
  quotes: Quote[];
  selectedQuoteId?: string;
  decision: PolicyDecision;
  savingsKobo: string;
  baselineKobo: string;
  pooledTotalKobo: string;
  payments: FrozenPayment[];
  attack?: {
    blocked: boolean;
    supplier: string;
    submittedAt: string;
    quoteTotalKobo: string;
    attemptedText: string;
    reasons: string[];
  };
};

export type MerchantPolicy = {
  merchantId: string;
  merchantName: string;
  version: string;
  maxOrderKobo: string;
  dailyCapKobo: string;
  maxUnitKobo: string;
  allowedSuppliers: string[];
  allowedTokens: string[];
  allowedRecipients: string[];
  approvalThresholdKobo: string;
  autoApproveBelowKobo: string;
  emergencyStop: boolean;
};

export type AuditEvent = {
  id: string;
  type: string;
  merchantId?: string;
  roundId?: string;
  at: string;
  summary: string;
};

export type DashboardState = {
  merchantId: string;
  merchantName: string;
  policy: MerchantPolicy;
  requests: RestockRequest[];
  round: ProcurementRound;
  events: AuditEvent[];
  dailySpendKobo: string;
  agentCount: { buyers: number; suppliers: number };
  storage: "memory" | "postgres";
};
