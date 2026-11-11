# Restock Relay

Restock Relay lets independent neighborhood shops combine compatible wholesale orders, compare structured supplier quotes, and approve only their own allocated share. Buyer and supplier agents are deterministic demo agents. The server policy engine decides whether an offer can proceed; the score never authorizes a payment.

## Problem and solution

Small food shops often buy in quantities too small to get strong wholesale prices. Each owner searches suppliers, negotiates alone, and carries the risk of buying the wrong item or exceeding a cash limit. Combining orders could improve buying power, but handing one operator a shared wallet would create a new custody and trust problem.

Restock Relay coordinates the purchasing work while keeping the orders separate. Shops set item, quantity, deadline, unit-price and total-spend limits, supplier rules, and who must approve. Deterministic buyer agents find compatible demand; supplier agents return structured quotes; a published rule ranks eligible offers; and a server policy engine checks the proposed share against each shop’s limits. Each shop keeps its own allocation and authorization.

The distinctive choice is **shared buying without a shared purse**. The optional NEAR testnet contract records a hash of the frozen round and requires each listed account to approve its exact allocation. It does not custody money or settle a supplier invoice. This makes the prototype useful to discuss AI Swarms and AI Security while keeping the payment boundary honest.

**Track fit demonstrated:** `swarms` / AI Swarms (20 deterministic buyers pool demand and five deterministic suppliers quote); `security` / AI Security & Defense (server spend rules, allowlists, frozen approvals, durable idempotency claims, expiry, attack fixture, emergency stops, and merchant-authorized NEAR testnet approvals). Autonomous Business is a prototype direction, not a claim of unattended business operation. Purchase payment is simulated, so this build does not claim `realworld` / Real-World Money support.

## Run the demo

Requirements: Node.js 20.9 or newer and npm.

```sh
npm ci
npm run dev
```

For a PostgreSQL-backed run, copy the safe names in `.env.example` into your project-root `.env`, then set `DATABASE_URL` to your PostgreSQL connection string. Keep the `.env` you already use; do not overwrite it with the example file. Run `npm run db:migrate` once, then start the app. `NEXT_PUBLIC_NEAR_TESTNET_CONTRACT_ID` is optional unless you want to use the on-chain approval panel.

Open http://localhost:3000, then follow the [shop-owner walkthrough](TRADER_DEMO_GUIDE.md). It tells you which page and button to use at each step, in everyday language. The seeded buying round takes about two minutes. After the first quote comparison, click **Test supplier withdrawal** to run a second, deterministic scenario: Lagos Fresh withdraws, the app excludes that quote, and the remaining eligible offers are re-ranked under the same shop rules. The simulated agents, supplier offers and purchase are clearly labeled; no supplier is contacted and no money moves.

Use **Reset demo** in the page header to restore the seeded fixture.

Run deterministic product and policy tests with `npm test` (Node.js 22.6 or newer). For the HTTP procurement-flow test, run `npm run build` followed by `npm run test:e2e`; it starts the built app on a temporary local port with database persistence disabled, so it does not touch the database configured in your `.env`. Run Rust contract tests from `contracts/restock-relay` with `cargo test` after installing the Rust toolchain and fetching contract dependencies.

For the judge-facing recording, use the [demo video guide](DEMO_VIDEO_GUIDE.md) for a timed screen plan, narration, and accurate simulated-payment/testnet labels.

### If the demo database is not ready

If an action says the demo database is missing tables, open a terminal in the project folder and run:

```sh
npm run db:migrate
npm run dev
```

Make sure `DATABASE_URL` points to the same PostgreSQL database in which you ran the migration. Put it in the project-root `.env` or `.env.local`; Next.js and Drizzle load both, and `.env.local` takes precedence when both define the same variable. If you do not want to use PostgreSQL for a local walkthrough, remove `DATABASE_URL` from both files (or leave it blank in the higher-priority file) and restart the app; it will use temporary in-memory demo storage. Do not share your database URL.

For Supabase, use the database connection string from **Project → Connect**, not the Supabase project URL or anon key. Add it as `DATABASE_URL` in the project-root `.env` (or `.env.local`); the migration config loads the same files. Use a direct connection for migrations when reachable. If your network cannot reach Supabase over IPv6, choose the **Session pooler** connection string (port `5432`) from the Connect dialog. Copy its exact host and username; do not use Transaction pooler (port `6543`) for migrations. Then run `npm run db:migrate` from the project root. Supabase documents these connection modes in its [Postgres connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

Replace the literal `[YOUR-PASSWORD]` in the copied connection string with the database password from the Supabase project. If it is unknown, reset it in **Database → Settings**. Percent-encode reserved characters in the password before putting it in the URL. Never paste the connection string into chat or commit `.env` or `.env.local`.

### Cross-device walkthrough

Check the public landing page and buying desk on desktop and phone widths. On desktop, use the left buying-desk navigation. At a phone width, use the five-tab bottom navigation; the quote table scrolls horizontally and the restock form changes to a stacked layout. Check the overview, requests, procurement, security, and audit views at both widths. The form, approval panel, and wallet confirmation should remain within the screen and keep all actions reachable above the mobile navigation.

## Design system

- **Palette:** warehouse paper `#EFF3F6`, deep navy `#112B45`, purchasing blue `#315FCA`, citrus `#ECA92E`, verified green `#347958`.
- **Type:** editorial system serif for procurement headings, sans-serif for controls and explanations, monospace for amounts, policy versions and event codes.
- **Layout:** a compact buying desk with persistent desktop navigation, a fixed five-tab mobile bar, a quote and allocation center, and a separate guardrail rail.
- **Signature:** the demand braid draws three independent shop orders into a pooled lot, then splits the lot into merchant shares. It runs once when a round starts and respects reduced-motion preferences.

## Architecture

- `src/core/simulation.ts` — deterministic buyer validation swarm, market fixtures, pooling, quote ranking, pro-rata allocations, a simulated supplier-withdrawal rerank, attack simulation, and approval state changes.
- `src/core/policy.ts` — server-side `allow` / `warn` / `block` evaluation, including quote line prices, line totals, each request’s unit ceiling and each merchant’s allocation. Supplier text does not enter this evaluator.
- `src/core/payments/adapter.ts` — server-only simulator adapter. It reports `simulated`, with a null transaction hash and URL. It does not call a wallet, RPC, or payment provider.
- `src/app/api/**` — validated request boundaries, streamed 32 KB body limit, required same-origin JSON mutations, NEAR RPC response validation, and per-route rate limits.
- `src/server/idempotency-memory.ts` and `src/server/store.ts` — action claims; PostgreSQL uses a unique insert before work, then completes the claim in the same transaction as the dashboard snapshot. Payment also claims a stable round/shop key, so a fresh request key cannot execute that same frozen allocation twice.
- `src/app/near-testnet-approval.tsx` and `src/app/api/near/contract/route.ts` — optional testnet wallet signing and a same-origin, rate-limited read of the fixed testnet contract through the public FastNear testnet RPC. Writes are signed by the merchant wallet; the app never handles private keys.
- `src/db/schema.ts` and `drizzle/0000_initial.sql` — Drizzle/PostgreSQL relational schema and migration. When `DATABASE_URL` is set, the demo state is loaded and saved as a snapshot; normalized records, approvals, quote details, payment intents, receipts, idempotency keys and audit events are also written. Without it, the same flow runs in process memory.
- `contracts/restock-relay/` — a bounded Rust contract for testnet. A round creator commits the procurement result and each shop’s frozen allocation hash. Each participating shop signs its own approval; the contract marks the round authorized only after every listed shop approves. The contract has an owner-controlled emergency stop and never holds purchase funds.

### Quote rule

Each quote receives a 0–10,000 basis-point score:

```text
score = round((priceScore × 55 + deliveryScore × 25 + trustEvidenceScore × 20) / 100)
priceScore = lowest eligible total × 10,000 / this quote total
deliveryScore = max(0, 10,000 − max(0, deliveryHours − 4) × 420)
trustEvidenceScore = structured supplier trust basis points
```

Each deterministic supplier fixture applies its own price basis-point factor to the requested line ceilings, producing itemized unit offers rounded up to whole kobo. The supplier total is the sum of those lines, and the server checks each quoted unit against its merchant’s ceiling. Supplier eligibility is checked first using the combined supplier allowlist and pooled maximum. Only eligible offers can win. Tie breaks use lower total price, then supplier ID. The selected quote is then passed through the merchant policy engine; a high score cannot bypass that decision. Trust values and quote evidence are fixtures, not externally verified claims.

Buy-alone baseline = the sum of every requested line item’s maximum unit price × quantity, increased by a documented 14% modeled spot-price uplift. Savings compare this estimate with the selected pooled total. This is a simulation baseline, not a market quote or a guaranteed saving.

### Payment and NEAR boundary

The local dashboard payment path is simulated: it does not move money. Each simulated shop payment is individually approved against a SHA-256 fingerprint of the frozen merchant, amount, currency, recipient, quote and expiry. The approval expires after five minutes. A repeated approval cannot create a second simulated receipt for the same round and merchant. Auto-approval is set to zero.

“No NEAR Intents testnet” means the Intents quote/solver/settlement service has no test deployment. It does not mean NEAR Protocol testnet or Rust smart contracts are unavailable. The separate contract in `contracts/restock-relay/` is designed for NEAR testnet and records merchant approvals for exact allocation commitments. The optional app integration uses a testnet wallet to sign contract calls; only SHA-256 commitments and account IDs go on-chain. It does not integrate Intents, make a supplier payment, or prove that goods were delivered. Do not describe its approval transaction as a payment.

The project does not request a mainnet quote, sign an Intents order, submit funds, or label a simulation as settlement. The contract emergency stop is independent from the server policy stop; both stop approvals in the app, while the on-chain stop also rejects direct contract calls. See the contract README for build and testnet deployment commands.

### Set up a testnet wallet and deploy the approval contract

Use a separate `.testnet` contract account and owner/shop account. A wallet is only needed to sign transactions; the web app never asks for a private key. The current NEAR Connect manifest lists testnet transaction signing for Meteor Wallet. HOT Wallet's manifest entry has transaction signing enabled but does not advertise testnet, so it may not appear in this app's testnet-only wallet picker.

Your terminal showed that `rustup`, `cargo`, and `near` are not installed yet. On Ubuntu, install them first. The commands below follow NEAR’s [official contract quickstart](https://docs.near.org/smart-contracts/quickstart) and [NEAR CLI-RS install guide](https://near.cli.rs/):

```sh
sudo apt update
sudo apt install -y curl build-essential

# Install Rust and Cargo, then load them into this terminal.
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup default stable
rustup target add wasm32-unknown-unknown

# Install the NEAR command line tool.
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
source "$HOME/.cargo/env"

# Confirm the commands are available before continuing.
rustup --version
cargo --version
near --version
```

If `near` still says “command not found,” close and reopen the terminal, then run `source "$HOME/.cargo/env"` once more. Do not use Ubuntu’s `apt install cargo` suggestion here; Rustup supplies the current Rust toolchain and Cargo together.

Now create two free testnet accounts. Testnet account names are shared, so replace these examples if either one is already taken:

```sh
near create-account relay-gate-fawazdevx.testnet --useFaucet
near create-account fawazdevx-owner.testnet --useFaucet
```

If account creation fails because this Ubuntu terminal has no system keychain (common on WSL or a headless server), use NEAR’s documented headless command for the account that failed, replacing the example name. Skip an account that was already created successfully:

```sh
near account create-account sponsor-by-faucet-service relay-gate-fawazdevx.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near account create-account sponsor-by-faucet-service fawazdevx-owner.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
```

This fallback saves testnet credentials in the CLI’s legacy local credential store. Use it only for these disposable testnet accounts.

Keep both accounts’ keys in NEAR CLI-RS. You do not need to import or export a key for the app: its wallet picker includes the **NEAR CLI** signer for testnet. NEAR Connect’s current manifest lists that signer for testnet transactions, and its connector asks you to run the transaction command in your terminal, then return the transaction hash for verification.[NEAR Connect wallet manifest](https://github.com/azbang/near-connect/blob/main/repository/manifest.json) · [NEAR CLI Connect instructions](https://github.com/near/near-cli-connect#readme)

Build and deploy the approval contract from its directory:

```sh
cd ~/hack-projects/restock-relay/contracts/restock-relay
cargo build --target wasm32-unknown-unknown --release
near deploy relay-gate-fawazdevx.testnet ./target/wasm32-unknown-unknown/release/restock_relay_contract.wasm
near call relay-gate-fawazdevx.testnet new '{"owner_id":"fawazdevx-owner.testnet"}' --useAccount fawazdevx-owner.testnet
near view relay-gate-fawazdevx.testnet get_status '{}'
```

Then put `NEXT_PUBLIC_NEAR_TESTNET_CONTRACT_ID=relay-gate-fawazdevx.testnet` in the project-root `.env` (or `.env.local`) and restart Next.js. In the app, run a seeded round, open **Receipts & audit**, click **Connect wallet**, and choose **NEAR CLI**. Prepare the approval and review the amount and hashes. When the CLI connector shows a command, copy it into your terminal and run it; return the transaction hash as the connector instructs. The app requires a wallet-reported successful outcome, then checks that the contract contains the exact round, result hash and approved allocation before marking it confirmed. This records an approval; it does not pay a supplier.

The contract account and owner must be different. Keep recovery phrases and signing keys out of the repository, `.env`, and `.env.local`. Full commands and wallet capability notes are in [`contracts/restock-relay/README.md`](contracts/restock-relay/README.md).

## Database setup

For the default judging demo, Postgres is optional. To use persistent storage:

1. Create a PostgreSQL database.
2. Put the environment variables from `.env.example` in your project-root `.env` (or `.env.local`) and set `DATABASE_URL` to that database. Set `APP_ORIGIN` to the exact app origin in deployments.
3. Run:

   ```sh
   npm run db:migrate
   ```

4. Restart `npm run dev`. The first dashboard request seeds a demo snapshot and normalized records.

Money is stored as integer kobo strings, never floating-point database values. Currency is explicit (`NGN`). The schema scopes requests, policies, participants, approvals, payment intents and audit events through merchant foreign keys. It includes unique constraints and indexes for merchant membership, rounds, quotes, payments, audit queries and idempotency.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | No | PostgreSQL connection for persistent demo storage; absent means process memory. |
| `APP_ORIGIN` | No | Expected origin for API mutations; defaults to the incoming app origin during local development. |
| `NEXT_PUBLIC_NEAR_TESTNET_CONTRACT_ID` | No | Deployed `.testnet` approval contract account. Blank means the testnet wallet panel is inactive. |

`.env.example` contains placeholders only. There are no wallet keys, provider credentials or paid API dependencies.

## Security model

### Threats considered

- A supplier submits an excessive price, unapproved recipient or prompt-injection text.
- An agent or caller retries a round/payment action or replays an expired approval.
- A user tries to approve another merchant’s allocation.
- A purchase exceeds merchant limits or arrives while the emergency stop is engaged.
- Browser data or supplier prose is mistaken for an authoritative policy result.

### Controls in this prototype

- Quote ranking and policy evaluation are separate deterministic modules. Supplier offers include itemized unit prices and totals; the policy checks those against the server’s current policy and each merchant’s frozen request before an offer can proceed.
- Supplier text is escaped by React text rendering, never evaluated as code or instructions.
- API inputs use strict Zod schemas, streamed body-size enforcement, and a required same-origin `Origin` check for JSON mutations. The testnet status response is validated before the browser reads it. There is no permissive CORS configuration.
- The browser cannot supply a merchant ID to authorize. The route binds approval to the fixed demo merchant on the server and checks the payment fingerprint and expiry.
- Payment details are immutable during an approval window. Changing round/quote changes the fingerprint; stale approvals are rejected.
- The emergency stop blocks new rounds and authorizations server-side.
- Database-backed idempotency claims are reserved before action execution and finalized with the dashboard snapshot. A stable round/shop claim blocks a second attempt even if it supplies a new request key. If an adapter outcome is uncertain, the claim stays pending and fails closed; the app does not auto-retry it. Audit writes are insert-only in the application.
- No private keys, seed phrases, signatures, wallet secrets, merchant PII or provider secrets are stored.

### Prototype limits

This is a single-demo-merchant identity, not production authentication or multi-user authorization. Use one app server instance for the demo: the dashboard cache and rate limiter are process-local, and the mutation queue does not coordinate multiple instances. Production needs authenticated merchant memberships, distributed rate limiting, and database-transactional state transitions. Without Postgres, memory state and idempotency claims are lost on restart. Daily spend is tracked inside the current demo state and is not reconciled with external bank or wallet activity. Trust scores and supplier histories are sample data; there is no real quote API, supplier onboarding, purchase payment, or Intents settlement. A testnet transaction link is held in browser memory for the current session only; PostgreSQL does not yet index on-chain approval transactions. If the contract read is delayed, the receipt says the wallet reported finality but the contract check is pending, and **Refresh contract status** can confirm the exact allocation. The status panel depends on a free public testnet RPC, so provider rate limits or outages can delay reads. The contract does not enforce the app's off-chain spending policy. The current web flow commits one connected merchant per round; other shops are simulated. Do not use it to make actual purchasing decisions.

## NEAR documentation reviewed

- [Current NEAR HACKATHON.md](https://nearhackathon.com/HACKATHON.md) — includes the current track IDs, submission procedure and Intents testnet status.
- [NEAR Rust contract quickstart](https://docs.near.org/smart-contracts/quickstart) — Rust toolchain, build, and deployment workflow.
- [NEAR RPC providers](https://docs.near.org/api/rpc/providers) — current public testnet RPC endpoints.
- [NEAR Connect](https://hot-labs.org/near-connect) — wallet connection and user-held transaction signing used by the optional testnet flow.
- [NEP-297 contract events](https://docs.near.org/smart-contracts/anatomy/events) — standard event format used for approval receipts.
- [NEAR contract security checklist](https://docs.near.org/smart-contracts/security/checklist) — access checks, bounds, replay protection, and storage guidance.
- [NEAR Intents 1Click API](https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api) — quote and swap API overview.
- [NEAR Intents signing](https://docs.near-intents.org/integration/verifier-contract/signing-intents) — wallet signing requirements.
- [NEAR Intents account abstraction](https://docs.near-intents.org/integration/verifier-contract/account-abstraction) — key registration and user signing flow.
- [NEAR Intents supported chains](https://docs.near-intents.org/resources/chain-support) — networks, address formats and signing standards.

## Current limitations

- Agents are simulations (20 buyers, five suppliers), not autonomous LLM services.
- Demo payment receipts are not blockchain receipts and have no transaction URL.
- The Rust approval contract and app wallet flow are implemented. The active deployment is account-specific: set `NEXT_PUBLIC_NEAR_TESTNET_CONTRACT_ID` to a deployed, initialized `.testnet` account, then verify its live status and transaction link in the app. A local environment value is not proof that a public judge deployment can reach it. Intents is not integrated because the official hackathon brief says there is no Intents testnet and this prototype must not use mainnet funds.
- The shared pool accepts fixture requests with compatible item identifiers and supplier rules; it does not connect to a live supplier catalog.
- Production use still needs real merchant identity, authorization, supplier verification, service monitoring and an officially documented settlement adapter.

## Stack

Next.js 16, React 19, TypeScript, Zod, PostgreSQL and Drizzle ORM. UI icons use Lucide React. No LLM or paid external service is called.
