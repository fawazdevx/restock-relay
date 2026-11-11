# Restock Relay Approval Gate

This Rust contract is Restock Relay’s testnet component. It records a bounded procurement result and each participating shop’s allocation hash. A shop must sign from its own NEAR account and approve the exact hash recorded for that account. The round reaches `authorized` only after every listed shop approves.

## What it enforces

- The initializer names the contract owner. Only that account can change the on-chain emergency stop.
- The emergency stop blocks opening rounds and merchant approvals. Expiry and cancellation remain available to close a pending round.
- Calls that open, approve, cancel, or change the stop must be direct wallet calls.
- Round numbers increase monotonically. A stale number cannot reopen a closed round.
- A round has 1–5 distinct NEAR accounts and expires within seven days. The app uses the frozen payment approval expiry, currently five minutes.
- Result and allocation commitments must be 32-byte lowercase hexadecimal SHA-256 values.
- Each merchant can approve once, and only its exact allocation hash. Expired, duplicate, mismatched, and unlisted approvals fail.
- State is bounded to one current round. Contract events and testnet transaction history retain transitions; the app keeps the displayed transaction hash in browser memory for the current session. After a reload, use wallet activity or the explorer history to retrieve it.

The contract does **not** hold pooled funds, execute payment, enforce off-chain merchant policy, verify a supplier quote, or confirm delivery. A successful transaction is an on-chain approval, not a settlement receipt. Full supplier details and NGN amounts stay off-chain; only opaque hashes and participant account IDs are stored on-chain.

## Commitment format

The app canonicalizes JSON by sorting object keys recursively, UTF-8 encodes it, then computes SHA-256. The result commitment covers the app round, quote set, frozen request limits, policy decision/version, and merchant allocations. Each allocation commitment covers the app round ID, merchant reference, the connected testnet account, supplier and quote references, exact kobo amount, currency, recipient, server-generated payment fingerprint, and the contract approval expiry.

The payment fingerprint and business details are not written on-chain; the allocation digest binds them without publishing those values. The contract treats submitted hashes as opaque commitments and cannot independently reconstruct the off-chain JSON.

## Local contract checks

Use Rust 1.95 or newer and add the `wasm32-unknown-unknown` target. From this directory:

```sh
cargo test
cargo build --target wasm32-unknown-unknown --release
```

The deployable artifact is:

```text
target/wasm32-unknown-unknown/release/restock_relay_contract.wasm
```

The unit suite covers independent merchant approvals, changed payment details, unauthorized accounts, duplicate approvals, replayed round numbers, expiry, duplicate participants, and the emergency stop. The build was also compiled to WASM locally.

## Deploy to NEAR testnet

If your terminal says `rustup`, `cargo`, or `near` is not found, install the tools first. On Ubuntu:

```sh
sudo apt update
sudo apt install -y curl build-essential

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup default stable
rustup target add wasm32-unknown-unknown

curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
source "$HOME/.cargo/env"

rustup --version
cargo --version
near --version
```

Close and reopen the terminal, or run `source "$HOME/.cargo/env"`, if a command is still missing. Then create two free testnet accounts with unique names: one for the contract and a separate owner/shop account. Keep account keys in your wallet or local CLI credential store; never put them in the repo or app.

If account creation fails because this Ubuntu terminal has no system keychain (common on WSL or a headless server), NEAR documents this fallback. Replace the example name and run it only for accounts that were not already created:

```sh
near account create-account sponsor-by-faucet-service relay-gate-fawazdevx.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near account create-account sponsor-by-faucet-service fawazdevx-owner.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
```

It stores those testnet accounts in the CLI's legacy local credential store, so keep the machine private.

```sh
# Testnet account names are shared; choose names that are available.
near create-account relay-gate-fawazdevx.testnet --useFaucet
near create-account fawazdevx-owner.testnet --useFaucet

# Build from this directory.
cargo test
cargo build --target wasm32-unknown-unknown --release

# Deploy the WASM to the contract account.
near deploy relay-gate-fawazdevx.testnet ./target/wasm32-unknown-unknown/release/restock_relay_contract.wasm

# Initialize as the account that will own the on-chain emergency stop.
near call relay-gate-fawazdevx.testnet new '{"owner_id":"fawazdevx-owner.testnet"}' --useAccount fawazdevx-owner.testnet

# Read on-chain state.
near view relay-gate-fawazdevx.testnet get_status '{}'
```

The contract account and owner account must be different. `new` must be called by the same owner account passed in `owner_id`. Replace the example testnet names if they are taken. Do not use a mainnet account.

Keep the owner key in NEAR CLI-RS; the app supports the **NEAR CLI** wallet option, so no key export or Meteor import is required. In **Receipts & audit**, click **Connect wallet** and choose **NEAR CLI**. When the connector asks you to sign, copy its command into the terminal where `near` is installed, run it, then return the transaction hash as instructed. The connector verifies the result on testnet. [NEAR CLI Connect explains this command-and-hash flow](https://github.com/near/near-cli-connect#readme).

Meteor Wallet is also listed as supporting testnet transaction signing, but only use it if you already have the testnet owner account imported and working there. Never paste a private key into the app, repository, `.env`, `.env.local`, screenshots, or chat.

Then set the deployed account in the project-root `.env` (or `.env.local`) and restart Next.js:

```env
NEXT_PUBLIC_NEAR_TESTNET_CONTRACT_ID=relay-gate-fawazdevx.testnet
```

Run the seeded procurement round, open **Receipts & audit**, click **Connect wallet**, and choose **NEAR CLI**. Prepare the on-chain approval, review the frozen share and hashes, then choose **Sign & commit on NEAR**. Follow the CLI connector’s instructions to run the generated command and return the transaction hash. The app checks the wallet-reported successful outcome and then confirms the exact round/allocation from contract state before marking the explorer receipt confirmed. The contract owner can pause or resume contract approvals from the same panel.

For this testnet flow, use a wallet whose current NEAR Connect manifest advertises both `testnet` and `signAndSendTransaction`; Meteor Wallet does. The current HOT Wallet entry advertises transaction signing but does not declare testnet support, so Restock Relay’s testnet-only wallet filter may not offer it. This is a capability check for the connector integration, not a claim about HOT Wallet’s separate NEAR mainnet features. See the [current NEAR Connect wallet manifest](https://github.com/azbang/near-connect/blob/main/repository/manifest.json).

The current web flow onboards one connected merchant account per round. The contract supports up to five participant accounts; other shops remain clearly identified as simulated unless they each connect and sign their own approval.

## Network and payment boundary

This is NEAR Protocol **testnet**. Testnet account actions and testnet gas do not move real purchase funds. NEAR Intents has no testnet deployment according to the current hackathon brief, so this contract does not submit an Intent, call an Intents solver, or settle a supplier invoice. Read the [official NEAR Intents FAQ](https://docs.near-intents.org/resources/faqs) for that separate network limitation.

Events use the `EVENT_JSON:` format with standard `restock_relay` and version `1.0.0`, following [NEP-297 guidance](https://docs.near.org/smart-contracts/anatomy/events). The contract is non-upgradeable and has no administrator method to transfer NEAR or tokens.
