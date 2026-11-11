import "server-only";
import type { FrozenPayment } from "@/core/types";
import { UserFacingError } from "@/core/errors";

export type PaymentExecution = {
  status: "simulated";
  adapter: "simulator";
  transactionHash: null;
  transactionUrl: null;
  recordedAt: string;
};

export interface PaymentAdapter {
  execute(payment: FrozenPayment): Promise<PaymentExecution>;
}

/** Replace only after a documented test/demo settlement flow exists. */
export const paymentAdapter: PaymentAdapter = {
  async execute(payment) {
    // This adapter records a demo outcome only. It performs no network call or wallet action.
    if (payment.currency !== "NGN" || BigInt(payment.amountKobo) < 0n || !payment.fingerprint) {
      throw new UserFacingError("The payment details are invalid. Review the receipt and try again.", 400);
    }
    return {
      status: "simulated",
      adapter: "simulator",
      transactionHash: null,
      transactionUrl: null,
      recordedAt: new Date().toISOString(),
    };
  },
};
