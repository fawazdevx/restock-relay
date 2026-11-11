use near_sdk::{
    env, json_types::U64, near, require, AccountId, PanicOnDefault,
};

const MAX_PARTICIPANTS: usize = 5;
const HASH_HEX_LENGTH: usize = 64;
const MAX_ROUND_LIFETIME_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParticipantInput {
    pub account_id: AccountId,
    /// SHA-256 of this merchant's frozen quote lines, quantity, and allocation.
    pub allocation_hash: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParticipantApproval {
    pub account_id: AccountId,
    pub allocation_hash: String,
    pub approved: bool,
    pub approved_at_ns: Option<U64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RoundStatus {
    AwaitingApprovals,
    Authorized,
    Cancelled,
    Expired,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProcurementRound {
    pub round_number: U64,
    pub creator_id: AccountId,
    /// Digest of the complete off-chain procurement result. No quote or PII is stored here.
    pub result_hash: String,
    pub created_at_ns: U64,
    pub expires_at_ns: U64,
    pub status: RoundStatus,
    pub approvals_count: u8,
    pub participants: Vec<ParticipantApproval>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContractStatus {
    pub owner_id: AccountId,
    pub emergency_stop: bool,
    pub next_round_number: U64,
    pub current_round: Option<ProcurementRound>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    emergency_stop: bool,
    next_round_number: u64,
    current_round: Option<ProcurementRound>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        let caller = env::predecessor_account_id();
        require!(
            env::signer_account_id() == caller,
            "Direct wallet calls are required"
        );
        require!(owner_id == caller, "Only the designated owner can initialize");
        Self {
            owner_id,
            emergency_stop: false,
            next_round_number: 1,
            current_round: None,
        }
    }

    /// Open a bounded approval round. A round number is consumed once, even if it is later
    /// cancelled or expires, so replaying a previously submitted action cannot reopen it.
    pub fn open_round(
        &mut self,
        round_number: U64,
        result_hash: String,
        participants: Vec<ParticipantInput>,
        expires_at_ns: U64,
    ) -> U64 {
        let caller = env::predecessor_account_id();
        require!(
            env::signer_account_id() == caller,
            "Direct wallet calls are required"
        );
        require!(!self.emergency_stop, "Emergency stop is on; new approvals are disabled");
        require!(
            round_number.0 == self.next_round_number,
            "Round number is stale or already used"
        );
        require!(
            self.current_round
                .as_ref()
                .is_none_or(|round| round.status != RoundStatus::AwaitingApprovals),
            "The previous round must be authorized, cancelled, or expired first"
        );
        require!(valid_hash(&result_hash), "Result hash must be 64 lowercase hex characters");
        require!(
            !participants.is_empty() && participants.len() <= MAX_PARTICIPANTS,
            "A round needs between 1 and 5 merchants"
        );

        let now = env::block_timestamp();
        require!(
            expires_at_ns.0 > now
                && expires_at_ns.0.saturating_sub(now) <= MAX_ROUND_LIFETIME_NS,
            "Expiry must be in the future and within 7 days"
        );

        let mut unique_accounts = std::collections::BTreeSet::new();
        let mut stored_participants = Vec::with_capacity(participants.len());
        for participant in participants {
            require!(
                valid_hash(&participant.allocation_hash),
                "Allocation hash must be 64 lowercase hex characters"
            );
            require!(
                unique_accounts.insert(participant.account_id.clone()),
                "Duplicate merchant accounts are not allowed"
            );
            stored_participants.push(ParticipantApproval {
                account_id: participant.account_id,
                allocation_hash: participant.allocation_hash,
                approved: false,
                approved_at_ns: None,
            });
        }

        let next = self
            .next_round_number
            .checked_add(1)
            .expect("Round counter exhausted");
        let round = ProcurementRound {
            round_number,
            creator_id: caller.clone(),
            result_hash: result_hash.clone(),
            created_at_ns: U64(now),
            expires_at_ns,
            status: RoundStatus::AwaitingApprovals,
            approvals_count: 0,
            participants: stored_participants,
        };

        emit_event(
            "round_opened",
            near_sdk::serde_json::json!({
                "round_number": round_number,
                "creator_id": caller,
                "result_hash": result_hash,
                "participant_count": round.participants.len(),
                "expires_at_ns": expires_at_ns,
            }),
        );

        self.next_round_number = next;
        self.current_round = Some(round);
        round_number
    }

    /// Record the caller's own authorization for the exact allocation commitment in the round.
    /// The caller is checked against predecessor_account_id, so another shop cannot approve it.
    pub fn approve_allocation(&mut self, round_number: U64, allocation_hash: String) {
        let caller = env::predecessor_account_id();
        require!(
            env::signer_account_id() == caller,
            "Direct wallet calls are required"
        );
        require!(!self.emergency_stop, "Emergency stop is on; new approvals are disabled");
        require!(
            valid_hash(&allocation_hash),
            "Allocation hash must be 64 lowercase hex characters"
        );

        let round = self
            .current_round
            .as_mut()
            .expect("No procurement round is open");
        require!(round.round_number == round_number, "Unknown or stale round number");
        require!(
            round.status == RoundStatus::AwaitingApprovals,
            "This round is not accepting approvals"
        );
        require!(
            env::block_timestamp() < round.expires_at_ns.0,
            "This approval round has expired"
        );

        let participant = round
            .participants
            .iter_mut()
            .find(|participant| participant.account_id == caller)
            .expect("Caller is not a merchant in this round");
        require!(!participant.approved, "This merchant already approved");
        require!(
            participant.allocation_hash == allocation_hash,
            "Allocation hash does not match the frozen payment details"
        );

        let approved_at_ns = U64(env::block_timestamp());
        participant.approved = true;
        participant.approved_at_ns = Some(approved_at_ns);
        round.approvals_count = round
            .approvals_count
            .checked_add(1)
            .expect("Approval counter overflow");

        emit_event(
            "allocation_approved",
            near_sdk::serde_json::json!({
                "round_number": round_number,
                "merchant_id": caller,
                "allocation_hash": allocation_hash,
                "approved_at_ns": approved_at_ns,
            }),
        );

        if usize::from(round.approvals_count) == round.participants.len() {
            round.status = RoundStatus::Authorized;
            emit_event(
                "round_authorized",
                near_sdk::serde_json::json!({
                    "round_number": round_number,
                    "result_hash": round.result_hash,
                    "approvals_count": round.approvals_count,
                }),
            );
        }
    }

    /// Only the round creator may cancel a round, and only before all merchants authorize.
    pub fn cancel_round(&mut self, round_number: U64) {
        let caller = env::predecessor_account_id();
        require!(
            env::signer_account_id() == caller,
            "Direct wallet calls are required"
        );
        let round = self
            .current_round
            .as_mut()
            .expect("No procurement round is open");
        require!(round.round_number == round_number, "Unknown or stale round number");
        require!(round.creator_id == caller, "Only the round creator can cancel it");
        require!(
            round.status == RoundStatus::AwaitingApprovals,
            "Only a pending round can be cancelled"
        );
        round.status = RoundStatus::Cancelled;
        emit_event(
            "round_cancelled",
            near_sdk::serde_json::json!({ "round_number": round_number, "caller_id": caller }),
        );
    }

    /// The contract owner can pause opening rounds and merchant approvals.
    pub fn set_emergency_stop(&mut self, enabled: bool) {
        let caller = env::predecessor_account_id();
        require!(
            env::signer_account_id() == caller,
            "Direct wallet calls are required"
        );
        require!(caller == self.owner_id, "Only the contract owner can change the emergency stop");
        self.emergency_stop = enabled;
        emit_event(
            "emergency_stop_changed",
            near_sdk::serde_json::json!({ "enabled": enabled, "owner_id": caller }),
        );
    }

    /// Anyone can close an unapproved round after its fixed expiry.
    pub fn expire_round(&mut self, round_number: U64) {
        let round = self
            .current_round
            .as_mut()
            .expect("No procurement round is open");
        require!(round.round_number == round_number, "Unknown or stale round number");
        require!(
            round.status == RoundStatus::AwaitingApprovals,
            "Only a pending round can expire"
        );
        require!(
            env::block_timestamp() >= round.expires_at_ns.0,
            "This round has not expired"
        );
        round.status = RoundStatus::Expired;
        emit_event(
            "round_expired",
            near_sdk::serde_json::json!({ "round_number": round_number }),
        );
    }

    pub fn get_next_round_number(&self) -> U64 {
        U64(self.next_round_number)
    }

    pub fn get_owner_id(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn get_emergency_stop(&self) -> bool {
        self.emergency_stop
    }

    pub fn get_status(&self) -> ContractStatus {
        ContractStatus {
            owner_id: self.owner_id.clone(),
            emergency_stop: self.emergency_stop,
            next_round_number: U64(self.next_round_number),
            current_round: self.current_round.clone(),
        }
    }

    pub fn get_current_round(&self) -> Option<ProcurementRound> {
        self.current_round.clone()
    }
}

fn valid_hash(value: &str) -> bool {
    value.len() == HASH_HEX_LENGTH
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn emit_event(name: &str, data: near_sdk::serde_json::Value) {
    let event = near_sdk::serde_json::json!({
        "standard": "restock_relay",
        "version": "1.0.0",
        "event": name,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{event}"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env};

    const NOW: u64 = 1_800_000_000_000_000_000;
    const RESULT_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const ALLOCATION_A: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const ALLOCATION_B: &str = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

    fn account(value: &str) -> AccountId {
        value.parse().expect("valid account")
    }

    fn set_context(account_id: &str, timestamp: u64) {
        let caller_id = account(account_id);
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(account("restock-relay.testnet"))
            .signer_account_id(caller_id.clone())
            .predecessor_account_id(caller_id)
            .block_timestamp(timestamp);
        testing_env!(builder.build());
    }

    fn participants() -> Vec<ParticipantInput> {
        vec![
            ParticipantInput {
                account_id: account("amina.testnet"),
                allocation_hash: ALLOCATION_A.to_string(),
            },
            ParticipantInput {
                account_id: account("tola.testnet"),
                allocation_hash: ALLOCATION_B.to_string(),
            },
        ]
    }

    fn open_two_shop_round(contract: &mut Contract) {
        set_context("amina.testnet", NOW);
        contract.open_round(
            U64(1),
            RESULT_HASH.to_string(),
            participants(),
            U64(NOW + 60_000_000_000),
        );
    }

    fn new_contract() -> Contract {
        set_context("admin.testnet", NOW);
        Contract::new(account("admin.testnet"))
    }

    #[test]
    fn each_shop_must_approve_its_committed_share_before_authorization() {
        let mut contract = new_contract();
        open_two_shop_round(&mut contract);

        set_context("amina.testnet", NOW + 1);
        contract.approve_allocation(U64(1), ALLOCATION_A.to_string());
        let round = contract.get_current_round().unwrap();
        assert_eq!(round.status, RoundStatus::AwaitingApprovals);
        assert_eq!(round.approvals_count, 1);

        set_context("tola.testnet", NOW + 2);
        contract.approve_allocation(U64(1), ALLOCATION_B.to_string());
        let round = contract.get_current_round().unwrap();
        assert_eq!(round.status, RoundStatus::Authorized);
        assert_eq!(round.approvals_count, 2);
    }

    #[test]
    #[should_panic(expected = "Allocation hash does not match the frozen payment details")]
    fn merchant_cannot_approve_changed_payment_details() {
        let mut contract = new_contract();
        open_two_shop_round(&mut contract);
        set_context("amina.testnet", NOW + 1);
        contract.approve_allocation(U64(1), ALLOCATION_B.to_string());
    }

    #[test]
    #[should_panic(expected = "Caller is not a merchant in this round")]
    fn unlisted_account_cannot_approve() {
        let mut contract = new_contract();
        open_two_shop_round(&mut contract);
        set_context("mallory.testnet", NOW + 1);
        contract.approve_allocation(U64(1), ALLOCATION_A.to_string());
    }

    #[test]
    #[should_panic(expected = "This merchant already approved")]
    fn repeated_approval_is_rejected() {
        let mut contract = new_contract();
        open_two_shop_round(&mut contract);
        set_context("amina.testnet", NOW + 1);
        contract.approve_allocation(U64(1), ALLOCATION_A.to_string());
        contract.approve_allocation(U64(1), ALLOCATION_A.to_string());
    }

    #[test]
    #[should_panic(expected = "Round number is stale or already used")]
    fn previously_used_round_number_cannot_be_replayed() {
        let mut contract = new_contract();
        open_two_shop_round(&mut contract);
        set_context("amina.testnet", NOW + 1);
        contract.cancel_round(U64(1));
        contract.open_round(
            U64(1),
            RESULT_HASH.to_string(),
            participants(),
            U64(NOW + 60_000_000_000),
        );
    }

    #[test]
    #[should_panic(expected = "This approval round has expired")]
    fn approvals_after_expiry_are_rejected() {
        let mut contract = new_contract();
        open_two_shop_round(&mut contract);
        set_context("amina.testnet", NOW + 60_000_000_000);
        contract.approve_allocation(U64(1), ALLOCATION_A.to_string());
    }

    #[test]
    #[should_panic(expected = "Duplicate merchant accounts are not allowed")]
    fn duplicate_participants_are_rejected() {
        let mut contract = new_contract();
        set_context("amina.testnet", NOW);
        let same_account = account("amina.testnet");
        contract.open_round(
            U64(1),
            RESULT_HASH.to_string(),
            vec![
                ParticipantInput {
                    account_id: same_account.clone(),
                    allocation_hash: ALLOCATION_A.to_string(),
                },
                ParticipantInput {
                    account_id: same_account,
                    allocation_hash: ALLOCATION_B.to_string(),
                },
            ],
            U64(NOW + 60_000_000_000),
        );
    }

    #[test]
    #[should_panic(expected = "Emergency stop is on; new approvals are disabled")]
    fn emergency_stop_blocks_merchant_approval() {
        let mut contract = new_contract();
        open_two_shop_round(&mut contract);

        set_context("admin.testnet", NOW + 1);
        contract.set_emergency_stop(true);

        set_context("amina.testnet", NOW + 2);
        contract.approve_allocation(U64(1), ALLOCATION_A.to_string());
    }

    #[test]
    #[should_panic(expected = "Only the contract owner can change the emergency stop")]
    fn non_owner_cannot_change_emergency_stop() {
        let mut contract = new_contract();
        set_context("mallory.testnet", NOW + 1);
        contract.set_emergency_stop(true);
    }
}
