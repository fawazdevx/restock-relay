"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BadgeCheck, CircleAlert, CircleCheck, ExternalLink, LoaderCircle, LockKeyhole, Pause, Play, WalletCards } from "lucide-react";
import type { ConnectorAction, NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { formatNaira } from "@/core/money";
import type { DashboardState, FrozenPayment, Quote } from "@/core/types";

type ChainParticipant = {
  account_id: string;
  allocation_hash: string;
  approved: boolean;
  approved_at_ns: string | null;
};

type ChainRound = {
  round_number: string;
  result_hash: string;
  created_at_ns: string;
  expires_at_ns: string;
  status: "awaiting_approvals" | "authorized" | "cancelled" | "expired";
  approvals_count: number;
  participants: ChainParticipant[];
};

type ChainStatus = {
  owner_id: string;
  emergency_stop: boolean;
  next_round_number: string;
  current_round: ChainRound | null;
};

type DraftCommitment = {
  roundNumber: string;
  resultHash: string;
  allocationHash: string;
  expiresAtNs: string;
  expiresAt: string;
};

type SavedReceipt = {
  transactionHash: string;
  roundNumber: string;
  roundId: string;
  allocationHash: string;
  resultHash: string;
  contractConfirmed: boolean;
};
type WalletSession = { connector: NearConnector; wallet: NearWalletBase; accountId: string };

const EXPLORER = "https://explorer.testnet.near.org/transactions/";
const GAS = "30000000000000";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("The commitment contains an unsupported value.");
  return serialized;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readStatus(): Promise<ChainStatus> {
  const response = await fetch("/api/near/contract?method=get_status", { cache: "no-store" });
  const payload = await response.json() as { result?: ChainStatus; error?: string };
  if (!response.ok || !payload.result) throw new Error(payload.error ?? "Could not read the testnet contract.");
  return payload.result;
}

function allocationCommitment(round: DashboardState["round"], quote: Quote, payment: FrozenPayment, accountId: string, expiresAtNs: string) {
  return {
    schema: "restock-relay/allocation/v1",
    procurement_round_id: round.id,
    merchant_ref: payment.merchantId,
    merchant_account: accountId,
    supplier_ref: quote.supplierId,
    quote_ref: payment.quoteId,
    amount_kobo: payment.amountKobo,
    currency: payment.currency,
    recipient: payment.recipient,
    payment_fingerprint: payment.fingerprint,
    expires_at_ns: expiresAtNs,
  };
}

function resultCommitment(state: DashboardState, quote: Quote) {
  return {
    schema: "restock-relay/result/v2",
    procurement_round_id: state.round.id,
    round_number: state.round.number,
    started_at: state.round.startedAt,
    mode: state.round.mode,
    scenario: state.round.scenario ?? "standard",
    baseline_kobo: state.round.baselineKobo,
    pooled_total_kobo: state.round.pooledTotalKobo,
    savings_kobo: state.round.savingsKobo,
    selected_quote: {
      quote_ref: quote.id,
      supplier_ref: quote.supplierId,
      pooled_total_kobo: quote.totalKobo,
      delivery_hours: quote.deliveryHours,
      trust_evidence_bps: quote.trustBps,
      score_bps: quote.scoreBps,
    },
    quote_set: state.round.quotes.map((item) => ({
      quote_ref: item.id,
      supplier_ref: item.supplierId,
      total_kobo: item.totalKobo,
      delivery_hours: item.deliveryHours,
      trust_evidence_bps: item.trustBps,
      score_bps: item.scoreBps,
      eligible: item.eligible,
      reasons: item.reasons,
      lines: item.items.map((line) => ({
        merchant_ref: line.merchantId,
        request_ref: line.requestId,
        item_ref: line.itemId,
        quantity: line.quantity,
        unit: line.unit,
        max_unit_price_kobo: line.maxUnitPriceKobo,
        unit_price_kobo: line.unitPriceKobo,
        total_kobo: line.totalKobo,
      })),
      supplier_note: item.note,
      untrusted_text: item.untrustedText ?? null,
    })),
    frozen_requests: state.round.shops.map((shop) => {
      const request = state.requests.find((item) => item.id === shop.requestId);
      return {
        merchant_ref: shop.id,
        request_ref: shop.requestId,
        request_title: request?.title ?? null,
        max_total_kobo: request?.maxTotalKobo ?? null,
        max_unit_price_kobo: request?.maxUnitPriceKobo ?? null,
        deadline: request?.deadline ?? null,
        allowed_suppliers: request?.allowedSuppliers ?? [],
        approval_threshold_kobo: request?.approvalThresholdKobo ?? null,
        items: (request?.items ?? []).map((line) => ({
          item_ref: line.id,
          name: line.name,
          quantity: line.quantity,
          unit: line.unit,
          max_unit_price_kobo: line.maxUnitPriceKobo,
        })),
      };
    }),
    allocations: state.round.shops.map((shop) => ({
      merchant_ref: shop.id,
      request_ref: shop.requestId,
      amount_kobo: shop.orderTotalKobo,
      baseline_kobo: shop.baselineKobo,
      modeled_savings_kobo: shop.savedKobo,
    })),
    policy: {
      decision: state.round.decision.decision,
      version: state.round.decision.policyVersion,
      reasons: state.round.decision.reasons,
      merchant_policy: {
        max_order_kobo: state.policy.maxOrderKobo,
        daily_cap_kobo: state.policy.dailyCapKobo,
        max_unit_kobo: state.policy.maxUnitKobo,
        allowed_suppliers: state.policy.allowedSuppliers,
        allowed_tokens: state.policy.allowedTokens,
        allowed_recipients: state.policy.allowedRecipients,
        approval_threshold_kobo: state.policy.approvalThresholdKobo,
      },
    },
  };
}

function functionCall(methodName: string, args: Record<string, unknown>): ConnectorAction {
  return { type: "FunctionCall", params: { methodName, args, gas: GAS, deposit: "0" } };
}

function explorerLink(hash: string) {
  return `${EXPLORER}${encodeURIComponent(hash)}`;
}

function finalizedTransactionHash(outcome: unknown): string {
  if (!outcome || typeof outcome !== "object") throw new Error("The wallet did not return a transaction outcome.");
  const tx = outcome as { status?: Record<string, unknown>; transaction?: { hash?: string } };
  if (tx.status && "Failure" in tx.status) throw new Error("NEAR testnet execution failed. Check the wallet activity before retrying.");
  if (!tx.status || !("SuccessValue" in tx.status)) throw new Error("The wallet returned no finalized success status. Check wallet activity before retrying.");
  if (!tx.transaction?.hash) throw new Error("The wallet returned no transaction hash. Check wallet activity before retrying.");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(tx.transaction.hash)) throw new Error("The wallet returned an invalid NEAR transaction hash. Check its activity before retrying.");
  return tx.transaction.hash;
}

function confirmsAllocation(status: ChainStatus, roundNumber: string, accountId: string, allocationHash: string, resultHash?: string): boolean {
  const round = status.current_round;
  if (!round || round.round_number !== roundNumber || (resultHash && round.result_hash !== resultHash)) return false;
  return round.participants.some((participant) => participant.account_id === accountId && participant.approved && participant.allocation_hash === allocationHash);
}

export function NearTestnetApproval({ state, payment, quote }: { state: DashboardState; payment?: FrozenPayment; quote?: Quote }) {
  const contractId = process.env.NEXT_PUBLIC_NEAR_TESTNET_CONTRACT_ID ?? "";
  const [session, setSession] = useState<WalletSession | null>(null);
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null);
  const [draft, setDraft] = useState<DraftCommitment | null>(null);
  const [savedReceipt, setSavedReceipt] = useState<SavedReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refreshStatus = useCallback(async () => {
    const next = await readStatus();
    setChainStatus(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!contractId) return;
        const { NearConnector } = await import("@hot-labs/near-connect");
        const connector = new NearConnector({
          network: "testnet",
          features: { testnet: true, signAndSendTransaction: true },
          autoConnect: false,
        });
        await connector.whenManifestLoaded;
        if (!active) return;
        try {
          const connected = await connector.getConnectedWallet();
          if (active) setSession({ connector, wallet: connected.wallet, accountId: connected.accounts[0].accountId });
        } catch { /* A disconnected wallet is the normal first-visit state. */ }
        if (contractId) await refreshStatus();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not initialize NEAR Connect.");
      } finally {
        if (active) setInitializing(false);
      }
    })();
    return () => { active = false; };
  }, [contractId, refreshStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const conditions = useMemo(() => ({
    hasQuote: Boolean(payment && quote),
    paymentAvailable: payment?.status === "awaiting_approval" || payment?.status === "simulated",
    paymentFresh: Boolean(payment && nowMs < new Date(payment.expiresAt).getTime()),
    notBlocked: state.round.decision.decision !== "block",
    appStopOff: !state.policy.emergencyStop,
    chainStopOff: !chainStatus?.emergency_stop,
    noPendingRound: !chainStatus?.current_round || chainStatus.current_round.status !== "awaiting_approvals",
  }), [chainStatus, nowMs, payment, quote, state.policy.emergencyStop, state.round.decision.decision]);

  const hasPendingReceipt = Boolean(savedReceipt && savedReceipt.roundId === state.round.id && !savedReceipt.contractConfirmed);
  const canPrepare = Boolean(session && chainStatus && conditions.hasQuote && conditions.paymentAvailable && conditions.paymentFresh && conditions.notBlocked && conditions.appStopOff && conditions.chainStopOff && conditions.noPendingRound && !hasPendingReceipt && !busy);

  const connect = async () => {
    setBusy(true); setError(""); setNote("");
    try {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const connector = new NearConnector({ network: "testnet", features: { testnet: true, signAndSendTransaction: true }, autoConnect: false });
      await connector.whenManifestLoaded;
      await connector.connect();
      const connected = await connector.getConnectedWallet();
      setSession({ connector, wallet: connected.wallet, accountId: connected.accounts[0].accountId });
      setNote("Testnet wallet connected. Review the shop share before signing.");
      if (contractId) await refreshStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet connection failed. Try a wallet that supports NEAR testnet.");
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!session) return;
    setBusy(true); setError("");
    try {
      await session.connector.disconnect(session.wallet);
      setSession(null); setDraft(null); setNote("Wallet disconnected.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not disconnect wallet."); }
    finally { setBusy(false); }
  };

  const refreshContractStatus = async () => {
    setBusy(true); setError(""); setNote("");
    try {
      const latest = await refreshStatus();
      if (session && savedReceipt && !savedReceipt.contractConfirmed && confirmsAllocation(latest, savedReceipt.roundNumber, session.accountId, savedReceipt.allocationHash, savedReceipt.resultHash)) {
        setSavedReceipt({ ...savedReceipt, contractConfirmed: true });
        setNote("NEAR testnet now confirms the exact allocation. The recorded transaction is an approval, not a supplier payment.");
      } else {
        setNote("Contract status refreshed from NEAR testnet.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh the NEAR contract status.");
    } finally { setBusy(false); }
  };

  const prepare = async () => {
    if (!session || !payment || !quote || !chainStatus) return;
    setBusy(true); setError(""); setNote("");
    try {
      const paymentExpiryMs = new Date(payment.expiresAt).getTime();
      if (!Number.isFinite(paymentExpiryMs) || paymentExpiryMs <= Date.now()) throw new Error("This frozen payment approval has expired. Run the procurement round again to refresh its quote.");
      const expiresAtNs = (BigInt(paymentExpiryMs) * 1_000_000n).toString();
      const [resultHash, allocationHash] = await Promise.all([
        sha256(resultCommitment(state, quote)),
        sha256(allocationCommitment(state.round, quote, payment, session.accountId, expiresAtNs)),
      ]);
      setDraft({
        roundNumber: chainStatus.next_round_number,
        resultHash,
        allocationHash,
        expiresAtNs,
        expiresAt: new Date(Number(BigInt(expiresAtNs) / 1_000_000n)).toISOString(),
      });
      setNote("Commitments prepared. The details and hashes below will be submitted in your wallet transaction.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare the allocation commitment."); }
    finally { setBusy(false); }
  };

  const signPrepared = async () => {
    if (!session || !draft || !contractId) return;
    setBusy(true); setError(""); setNote("");
    try {
      if (BigInt(draft.expiresAtNs) <= BigInt(Date.now()) * 1_000_000n) throw new Error("This approval preview expired. Prepare a fresh commitment before signing.");
      const outcome = await session.wallet.signAndSendTransaction({
        network: "testnet",
        signerId: session.accountId,
        receiverId: contractId,
        actions: [
          functionCall("open_round", {
            round_number: draft.roundNumber,
            result_hash: draft.resultHash,
            participants: [{ account_id: session.accountId, allocation_hash: draft.allocationHash }],
            expires_at_ns: draft.expiresAtNs,
          }),
          functionCall("approve_allocation", { round_number: draft.roundNumber, allocation_hash: draft.allocationHash }),
        ],
      });
      const transactionHash = finalizedTransactionHash(outcome);
      const receipt: SavedReceipt = { transactionHash, roundNumber: draft.roundNumber, roundId: state.round.id, allocationHash: draft.allocationHash, resultHash: draft.resultHash, contractConfirmed: false };
      setSavedReceipt(receipt);
      let latest: ChainStatus;
      try { latest = await refreshStatus(); }
      catch { throw new Error("Your wallet reports a finalized transaction, but the contract check is unavailable. Do not sign again; refresh contract status or check wallet activity."); }
      if (!confirmsAllocation(latest, draft.roundNumber, session.accountId, draft.allocationHash, draft.resultHash)) {
        throw new Error("The wallet reports a finalized transaction, but the contract has not confirmed this exact round and allocation yet. Refresh the contract status before trying another action.");
      }
      setSavedReceipt({ ...receipt, contractConfirmed: true });
      setDraft(null);
      setNote("NEAR testnet finalized the transaction and the contract confirmed this allocation. It records authorization; it does not pay the supplier.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The testnet transaction failed."); }
    finally { setBusy(false); }
  };

  const approveExisting = async () => {
    if (!session || !currentParticipant || !chainStatus?.current_round || !payment || !quote) return;
    setBusy(true); setError(""); setNote("");
    try {
      if (Date.now() >= new Date(payment.expiresAt).getTime()) throw new Error("This frozen payment approval has expired. Run the procurement round again to refresh its quote.");
      const expectedHash = await sha256(allocationCommitment(state.round, quote, payment, session.accountId, chainStatus.current_round.expires_at_ns));
      if (expectedHash !== currentParticipant.allocation_hash) throw new Error("This on-chain allocation was frozen from different payment details. Do not approve it from this round view.");
      const outcome = await session.wallet.signAndSendTransaction({
        network: "testnet",
        signerId: session.accountId,
        receiverId: contractId,
        actions: [functionCall("approve_allocation", { round_number: chainStatus.current_round.round_number, allocation_hash: currentParticipant.allocation_hash })],
      });
      const transactionHash = finalizedTransactionHash(outcome);
      const receipt: SavedReceipt = {
        transactionHash,
        roundNumber: chainStatus.current_round.round_number,
        roundId: state.round.id,
        allocationHash: currentParticipant.allocation_hash,
        resultHash: chainStatus.current_round.result_hash,
        contractConfirmed: false,
      };
      setSavedReceipt(receipt);
      let latest: ChainStatus;
      try { latest = await refreshStatus(); }
      catch { throw new Error("Your wallet reports a finalized transaction, but the contract check is unavailable. Do not sign again; refresh contract status or check wallet activity."); }
      if (!confirmsAllocation(latest, chainStatus.current_round.round_number, session.accountId, currentParticipant.allocation_hash)) {
        throw new Error("The wallet reports a finalized transaction, but the contract has not confirmed this exact allocation yet. Refresh contract status before trying again.");
      }
      setSavedReceipt({ ...receipt, contractConfirmed: true });
      setNote("NEAR testnet finalized your transaction and confirmed the allocation. No supplier payment occurred.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The testnet transaction failed."); }
    finally { setBusy(false); }
  };

  const toggleChainStop = async () => {
    if (!session || !chainStatus || session.accountId !== chainStatus.owner_id) return;
    const enabled = !chainStatus.emergency_stop;
    if (!enabled && state.policy.emergencyStop) {
      setError("Release the app emergency stop first. It remains the final server-side guard.");
      return;
    }
    setBusy(true); setError(""); setNote("");
    try {
      const outcome = await session.wallet.signAndSendTransaction({
        network: "testnet",
        signerId: session.accountId,
        receiverId: contractId,
        actions: [functionCall("set_emergency_stop", { enabled })],
      });
      finalizedTransactionHash(outcome);
      let latest: ChainStatus;
      try { latest = await refreshStatus(); }
      catch { throw new Error("Your wallet reports a finalized transaction, but the contract check is unavailable. Refresh contract status before repeating the stop action."); }
      if (latest.emergency_stop !== enabled) throw new Error("The transaction finalized, but the contract status has not confirmed the requested stop change yet.");
      setNote(enabled ? "Contract emergency stop is on. The contract blocks round creation and merchant approvals." : "Contract emergency stop is off.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the contract emergency stop."); }
    finally { setBusy(false); }
  };

  const expireCurrentRound = async () => {
    if (!session || !chainStatus?.current_round || !contractId) return;
    setBusy(true); setError(""); setNote("");
    try {
      const outcome = await session.wallet.signAndSendTransaction({
        network: "testnet",
        signerId: session.accountId,
        receiverId: contractId,
        actions: [functionCall("expire_round", { round_number: chainStatus.current_round.round_number })],
      });
      finalizedTransactionHash(outcome);
      const latest = await refreshStatus();
      if (latest.current_round?.status !== "expired") throw new Error("The transaction finalized, but the contract status view has not caught up. Refresh status before trying another action.");
      setNote("Expired approval round closed on NEAR testnet. A fresh round can now be opened.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not close the expired approval round."); }
    finally { setBusy(false); }
  };

  const currentRound = chainStatus?.current_round;
  const currentParticipant = currentRound?.participants.find((participant) => participant.account_id === session?.accountId);
  const currentRoundExpired = Boolean(currentRound && currentRound.status === "awaiting_approvals" && BigInt(nowMs) * 1_000_000n >= BigInt(currentRound.expires_at_ns));
  const canApproveExisting = Boolean(
    session && currentRound?.status === "awaiting_approvals" && currentParticipant && !currentParticipant.approved &&
    payment && quote && conditions.paymentFresh && state.round.decision.decision !== "block" &&
    !state.policy.emergencyStop && !chainStatus?.emergency_stop && !hasPendingReceipt && !busy,
  );
  const canToggleStop = Boolean(session && chainStatus && session.accountId === chainStatus.owner_id && !busy);

  return <section className="panel near-panel" aria-labelledby="near-panel-title">
    <div className="panel-head near-panel-head">
      <div><span className="eyebrow">NEAR TESTNET <span className="tiny-separator">·</span> ON-CHAIN APPROVAL GATE</span><h2 id="near-panel-title">Authorize a frozen shop share.</h2></div>
      <span className="near-network-pill"><span />TESTNET</span>
    </div>
    <p className="near-panel-intro">Commit hashes of the round, then let the connected merchant wallet approve its exact allocation. Testnet account IDs and hashes are public; hashes are integrity commitments, not encryption. The contract does not hold funds or pay suppliers.</p>

    {!contractId ? <div className="near-message warning"><CircleAlert size={16} /><div><strong>Contract not configured</strong><span>After deployment, set <code>NEXT_PUBLIC_NEAR_TESTNET_CONTRACT_ID</code> to its <code>.testnet</code> account and restart the app.</span></div></div> : <>
      <div className="near-connection-row">
        <div className="near-account"><span className="near-account-icon"><WalletCards size={16} /></span><div><strong>{session?.accountId ?? (initializing ? "Loading wallet options…" : "No wallet connected")}</strong><small>{session ? "Connected for testnet signing" : "Private keys stay in your wallet"}</small></div></div>
        {session ? <button className="button secondary small" disabled={busy} onClick={() => void disconnect()}>Disconnect</button> : <button className="button secondary small" disabled={busy || initializing} onClick={() => void connect()}>{busy ? <LoaderCircle className="spin" size={14} /> : <WalletCards size={14} />}Connect wallet</button>}
      </div>

      <div className="near-state-grid">
        <div><span>CONTRACT</span><strong title={contractId}>{contractId}</strong></div>
        <div><span>CONTRACT STOP</span><strong>{chainStatus ? chainStatus.emergency_stop ? "PAUSED" : "ACTIVE" : "READING…"}</strong></div>
        <div><span>NEXT ROUND</span><strong>{chainStatus?.next_round_number ?? "—"}</strong></div>
      </div>
      <button className="button secondary small near-refresh-status" disabled={busy || initializing} onClick={() => void refreshContractStatus()}>{busy ? <LoaderCircle className="spin" size={13} /> : <CircleCheck size={13} />}Refresh contract status</button>

      {chainStatus && <div className={`near-owner-row ${chainStatus.emergency_stop ? "paused" : ""}`}><span>{chainStatus.emergency_stop ? <Pause size={14} /> : <BadgeCheck size={14} />}{chainStatus.emergency_stop ? "Contract emergency stop is on" : `Owner: ${chainStatus.owner_id}`}</span>{session?.accountId === chainStatus.owner_id && <button className="text-button" disabled={!canToggleStop || (chainStatus.emergency_stop === false && state.policy.emergencyStop)} onClick={() => void toggleChainStop()}>{chainStatus.emergency_stop ? <><Play size={13} />Release contract stop</> : <><Pause size={13} />Stop contract approvals</>}</button>}</div>}

      {payment && quote && <div className="near-frozen-details">
        <span className="eyebrow">FROZEN DEMO ALLOCATION</span>
        <div><span>SHOP</span><strong>{payment.merchantName}</strong></div>
        <div><span>AMOUNT</span><strong>{formatNaira(payment.amountKobo)} <small>NGN</small></strong></div>
        <div><span>SUPPLIER</span><strong>{quote.supplierName}</strong></div>
        <div><span>RECIPIENT</span><strong>{payment.recipient}</strong></div>
        <small className="near-offchain-note">The NGN amount and recipient stay off-chain; only SHA-256 commitments are recorded.</small>
      </div>}

      {currentRound && <div className="near-current-round"><span className="near-round-mark"><CircleCheck size={15} /></span><div><strong>On-chain round {currentRound.round_number} · {currentRoundExpired ? "expired, awaiting close" : currentRound.status.replaceAll("_", " ")}</strong><small>{currentRound.approvals_count}/{currentRound.participants.length} shop approvals · result hash <code>{currentRound.result_hash.slice(0, 14)}…</code></small></div></div>}
      {currentRoundExpired && session && <div className="near-message warning"><CircleAlert size={16} /><div><strong>The approval window expired.</strong><span>Close this on-chain round before creating a new one. Any connected testnet account can submit the expiry call.</span><button className="button secondary small near-expire-button" disabled={busy} onClick={() => void expireCurrentRound()}>{busy ? <LoaderCircle className="spin" size={13} /> : <LockKeyhole size={13} />}Close expired round</button></div></div>}
      {session && <p className="near-identity-note">The connected testnet account signs as this prototype’s demo shop identity. Restock Relay does not independently verify merchant identity yet.</p>}

      {currentRound?.status === "awaiting_approvals" && session && !currentParticipant && <div className="near-message warning"><LockKeyhole size={16} /><div><strong>Your wallet is not listed for this open round.</strong><span>Only the account and exact allocation hash committed by the round creator can approve.</span></div></div>}
      {currentParticipant?.approved && <div className="near-message success"><CircleCheck size={16} /><div><strong>This wallet already approved its allocation.</strong><span>The contract rejects duplicate approvals. After a page reload, find the transaction in wallet activity; this prototype keeps its transaction link only in the current browser session.</span></div></div>}

      {session && conditions.noPendingRound && <>
        {state.round.quotes.length === 0 && <div className="near-message warning"><CircleAlert size={16} /><div><strong>Run a procurement round first.</strong><span>The on-chain commitment is made from the selected quote, policy result and merchant allocations.</span></div></div>}
        {!conditions.paymentFresh && payment && <div className="near-message warning"><CircleAlert size={16} /><div><strong>This frozen approval expired.</strong><span>Run the procurement round again to reprice the order before creating a testnet commitment.</span></div></div>}
        {state.round.decision.decision === "block" && <div className="near-message danger"><CircleAlert size={16} /><div><strong>Policy blocked this round.</strong><span>The testnet approval action stays disabled while the server decision is block.</span></div></div>}
        {state.policy.emergencyStop && <div className="near-message danger"><Pause size={16} /><div><strong>App emergency stop is on.</strong><span>Release it in Security before preparing a new testnet approval.</span></div></div>}
        {chainStatus?.emergency_stop && <div className="near-message danger"><Pause size={16} /><div><strong>Contract emergency stop is on.</strong><span>The contract rejects round creation and shop approvals until its owner releases it.</span></div></div>}
        {!draft ? <button className="button primary near-action" disabled={!canPrepare} onClick={() => void prepare()}>{busy ? <LoaderCircle className="spin" size={15} /> : <LockKeyhole size={15} />}Prepare testnet approval</button> : <>
          <div className="near-hashes"><div><span>RESULT SHA-256</span><code>{draft.resultHash}</code></div><div><span>YOUR ALLOCATION SHA-256</span><code>{draft.allocationHash}</code></div><div><span>APPROVAL EXPIRES</span><strong>{new Date(draft.expiresAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong></div></div>
          <div className="near-action-row"><button className="button primary near-action" disabled={busy || !conditions.appStopOff || !conditions.chainStopOff} onClick={() => void signPrepared()}>{busy ? <LoaderCircle className="spin" size={15} /> : <LockKeyhole size={15} />}Sign & commit on NEAR</button><button className="text-button" disabled={busy} onClick={() => setDraft(null)}>Discard preview</button></div>
          <p className="near-wallet-disclosure">Your wallet signs two contract actions: open this round and approve this account’s exact allocation. Only testnet gas is used; no purchase payment is attached.</p>
        </>}
      </>}

      {canApproveExisting && <div className="near-action-row"><button className="button primary near-action" disabled={busy} onClick={() => void approveExisting()}>{busy ? <LoaderCircle className="spin" size={15} /> : <LockKeyhole size={15} />}Review & approve my allocation</button><span className="near-wallet-disclosure">The UI checks the local frozen details against the hash already stored by the contract before opening your wallet.</span></div>}

      {savedReceipt && savedReceipt.roundId === state.round.id && <div className={`near-receipt ${savedReceipt.contractConfirmed ? "" : "near-receipt-pending"}`}><span className="near-receipt-icon">{savedReceipt.contractConfirmed ? <CircleCheck size={16} /> : <CircleAlert size={16} />}</span><div><strong>{savedReceipt.contractConfirmed ? "NEAR testnet approval confirmed" : "Wallet reports final · contract check pending"} · round {savedReceipt.roundNumber}</strong><small>Transaction <code>{savedReceipt.transactionHash.slice(0, 12)}…</code></small></div><a href={explorerLink(savedReceipt.transactionHash)} target="_blank" rel="noreferrer" aria-label="Open the NEAR testnet transaction reported by the wallet"><ExternalLink size={15} /></a></div>}

      {note && <p className="near-feedback success-text"><CircleCheck size={14} />{note}</p>}
      {error && <p className="near-feedback error-text"><CircleAlert size={14} />{error}</p>}
      {chainStatus && <a className="near-explorer-link" href={`https://explorer.testnet.near.org/accounts/${encodeURIComponent(contractId)}`} target="_blank" rel="noreferrer">View contract on testnet explorer <ArrowUpRight size={13} /></a>}
      <p className="near-boundary-note"><LockKeyhole size={13} />This is a signed on-chain procurement approval, not a NEAR Intents quote or settlement. Local payment receipts remain labeled simulated.</p>
    </>}
  </section>;
}
