// Keycopy records public leader trades and a follow cutoff.
// A follower can copy only a trade created after they followed.
// Settlement escrows a profit share. The contract does not read venue fills.
// The shared high water moves only when both sides submit the same profit
// and this copy's escrow pays that profit's entire fee.
use near_sdk::json_types::U64;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{AccountId, NearToken, PanicOnDefault, Promise, env, near, require};

pub const SETTLEMENT_TIMEOUT_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
const MAX_TRADES: usize = 100;
const MAX_CURVE: usize = 32;
const MAX_ASSET: usize = 128;
const MAX_AMOUNT: usize = 80;
const MAX_CIPHERTEXT: usize = 8_000;
const MAX_WRAPS: usize = 32;
const MAX_WRAPPED_KEY: usize = 512;
const MAX_HOLDINGS: usize = 16;
const MAX_SWAPS: usize = 100;
const MAX_PROFIT_LEN: usize = 40;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum Market {
    Spot,
    Perp,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side {
    Buy,
    Sell,
    Long,
    Short,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CopyStatus {
    Open,
    Proposed,
    Settled,
    Refunded,
}

#[near(serializers = [borsh])]
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
struct SubKey {
    leader: AccountId,
    follower: AccountId,
}

#[near(serializers = [borsh])]
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
struct MarketKey {
    leader: AccountId,
    follower: AccountId,
    market: Market,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct Leader {
    fee_bps: u16,
    display_name: String,
    leading_since: u64,
    snapshot: Option<Snapshot>,
    trade_ids: Vec<u64>,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct Snapshot {
    pnl_bps: i32,
    max_dd_bps: u32,
    win_rate_bps: u32,
    trade_count: u32,
    copier_pnl_bps: i32,
    journal_commitment: String,
    curve: Vec<i32>,
    updated_at: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct Follow {
    followed_at: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct ViewingRight {
    public_hex: String,
    bought_at: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct KeyWrap {
    buyer: AccountId,
    wrapped_key: String,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct Journal {
    ciphertext: String,
    wraps: Vec<KeyWrap>,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct Balance {
    token_id: String,
    available: String,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct Book {
    marked_at: u64,
    holdings: Vec<Balance>,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct Swap {
    id: u64,
    leader: AccountId,
    asset_out: String,
    amount_out: String,
    asset_in: String,
    amount_in: String,
    created_at: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct Trade {
    id: u64,
    leader: AccountId,
    market: Market,
    side: Side,
    asset: String,
    amount: String,
    created_at: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct Policy {
    spot_max_equity_bps: u16,
    perp_max_equity_bps: u16,
    max_leverage: u8,
    markets_commitment: String,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
struct CopyPosition {
    id: u64,
    follower: AccountId,
    leader: AccountId,
    trade_id: u64,
    market: Market,
    notional_commitment: String,
    equity_bps: u16,
    leverage: u8,
    escrow: NearToken,
    fee_paid: NearToken,
    proposed_profit: Option<String>,
    status: CopyStatus,
    opened_at: u64,
    proposed_at: u64,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct SnapshotView {
    pub pnl_bps: i32,
    pub max_dd_bps: u32,
    pub win_rate_bps: u32,
    pub trade_count: u32,
    pub copier_pnl_bps: i32,
    pub journal_commitment: String,
    pub curve: Vec<i32>,
    pub updated_at: U64,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct LeaderView {
    pub account_id: AccountId,
    pub fee_bps: u16,
    pub display_name: String,
    pub leading_since: U64,
    pub snapshot: Option<SnapshotView>,
    pub copier_count: u32,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct TradeView {
    pub id: U64,
    pub leader: AccountId,
    pub market: Market,
    pub side: Side,
    pub asset: String,
    pub amount: String,
    pub created_at: U64,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct FollowView {
    pub leader: AccountId,
    pub follower: AccountId,
    pub followed_at: U64,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct MarketFollowView {
    pub leader: AccountId,
    pub follower: AccountId,
    pub market: Market,
    pub followed_at: U64,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct ViewerView {
    pub leader: AccountId,
    pub buyer: AccountId,
    pub public_hex: String,
    pub bought_at: U64,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct WrapInput {
    pub buyer: AccountId,
    pub wrapped_key: String,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct JournalView {
    pub leader: AccountId,
    pub ciphertext: String,
    pub wraps: Vec<WrapInput>,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct PolicyView {
    pub spot_max_equity_bps: u16,
    pub perp_max_equity_bps: u16,
    pub max_leverage: u8,
    pub markets_commitment: String,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct BalanceInput {
    pub token_id: String,
    pub available: String,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct BookView {
    pub leader: AccountId,
    pub marked_at: U64,
    pub holdings: Vec<BalanceInput>,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct SwapView {
    pub id: U64,
    pub leader: AccountId,
    pub asset_out: String,
    pub amount_out: String,
    pub asset_in: String,
    pub amount_in: String,
    pub created_at: U64,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct CopyView {
    pub id: U64,
    pub follower: AccountId,
    pub leader: AccountId,
    pub trade_id: U64,
    pub market: Market,
    pub notional_commitment: String,
    pub equity_bps: u16,
    pub leverage: u8,
    pub escrow: NearToken,
    pub fee_paid: NearToken,
    pub proposed_profit: Option<String>,
    pub status: CopyStatus,
    pub opened_at: U64,
    pub proposed_at: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    leaders: IterableMap<AccountId, Leader>,
    follows: IterableMap<SubKey, Follow>,
    trades: IterableMap<u64, Trade>,
    next_trade_id: u64,
    policies: LookupMap<AccountId, Policy>,
    copies: IterableMap<u64, CopyPosition>,
    next_copy_id: u64,
    high_water: LookupMap<SubKey, i128>,
    market_follows: IterableMap<MarketKey, Follow>,
    view_prices: LookupMap<AccountId, NearToken>,
    viewers: IterableMap<SubKey, ViewingRight>,
    journals: LookupMap<AccountId, Journal>,
    books: LookupMap<AccountId, Book>,
    swaps: IterableMap<u64, Swap>,
    next_swap_id: u64,
    swap_ids: LookupMap<AccountId, Vec<u64>>,
    /// Fee rate captured when the copy opened. Later `register_leader` calls do not change it.
    opened_fee_bps: LookupMap<u64, u16>,
    /// Distinct followers across spot and perp. Avoids scanning every follow on each hall read.
    copier_counts: LookupMap<AccountId, u32>,
    follower_copy_ids: LookupMap<AccountId, Vec<u64>>,
    leader_copy_ids: LookupMap<AccountId, Vec<u64>>,
}

/// State of the previous release: books and swaps exist, settlement indexes do not.
#[near(serializers = [borsh])]
struct ContractV1 {
    leaders: IterableMap<AccountId, Leader>,
    follows: IterableMap<SubKey, Follow>,
    trades: IterableMap<u64, Trade>,
    next_trade_id: u64,
    policies: LookupMap<AccountId, Policy>,
    copies: IterableMap<u64, CopyPosition>,
    next_copy_id: u64,
    high_water: LookupMap<SubKey, i128>,
    market_follows: IterableMap<MarketKey, Follow>,
    view_prices: LookupMap<AccountId, NearToken>,
    viewers: IterableMap<SubKey, ViewingRight>,
    journals: LookupMap<AccountId, Journal>,
    books: LookupMap<AccountId, Book>,
    swaps: IterableMap<u64, Swap>,
    next_swap_id: u64,
    swap_ids: LookupMap<AccountId, Vec<u64>>,
}

/// On-chain state after viewing keys, before the frozen book.
#[near(serializers = [borsh])]
struct OldContract {
    leaders: IterableMap<AccountId, Leader>,
    follows: IterableMap<SubKey, Follow>,
    trades: IterableMap<u64, Trade>,
    next_trade_id: u64,
    policies: LookupMap<AccountId, Policy>,
    copies: IterableMap<u64, CopyPosition>,
    next_copy_id: u64,
    high_water: LookupMap<SubKey, i128>,
    market_follows: IterableMap<MarketKey, Follow>,
    view_prices: LookupMap<AccountId, NearToken>,
    viewers: IterableMap<SubKey, ViewingRight>,
    journals: LookupMap<AccountId, Journal>,
}

#[near]
impl Contract {
    #[init]
    pub fn init() -> Self {
        Self {
            leaders: IterableMap::new(b"l"),
            follows: IterableMap::new(b"f"),
            trades: IterableMap::new(b"t"),
            next_trade_id: 1,
            policies: LookupMap::new(b"p"),
            copies: IterableMap::new(b"c"),
            next_copy_id: 1,
            high_water: LookupMap::new(b"h"),
            market_follows: IterableMap::new(b"mf".as_slice()),
            view_prices: LookupMap::new(b"r"),
            viewers: IterableMap::new(b"v"),
            journals: LookupMap::new(b"j"),
            books: LookupMap::new(b"bk".as_slice()),
            swaps: IterableMap::new(b"sw".as_slice()),
            next_swap_id: 1,
            swap_ids: LookupMap::new(b"si".as_slice()),
            opened_fee_bps: LookupMap::new(b"e"),
            copier_counts: LookupMap::new(b"n"),
            follower_copy_ids: LookupMap::new(b"y"),
            leader_copy_ids: LookupMap::new(b"z"),
        }
    }

    /// Adds the frozen book and the swap list. Viewing keys and follows stay on their old prefixes.
    #[init(ignore_state)]
    #[private]
    pub fn migrate() -> Self {
        let old: OldContract = env::state_read().expect("old state");
        let mut contract = Self {
            leaders: old.leaders,
            follows: old.follows,
            trades: old.trades,
            next_trade_id: old.next_trade_id,
            policies: old.policies,
            copies: old.copies,
            next_copy_id: old.next_copy_id,
            high_water: old.high_water,
            market_follows: old.market_follows,
            view_prices: old.view_prices,
            viewers: old.viewers,
            journals: old.journals,
            books: LookupMap::new(b"bk".as_slice()),
            swaps: IterableMap::new(b"sw".as_slice()),
            next_swap_id: 1,
            swap_ids: LookupMap::new(b"si".as_slice()),
            opened_fee_bps: LookupMap::new(b"e"),
            copier_counts: LookupMap::new(b"n"),
            follower_copy_ids: LookupMap::new(b"y"),
            leader_copy_ids: LookupMap::new(b"z"),
        };
        contract.rebuild_indexes();
        contract
    }

    /// Locks the open fee and builds the hall indexes. Call once over a deployed v1 state.
    #[init(ignore_state)]
    #[private]
    pub fn migrate_v2() -> Self {
        let old: ContractV1 = env::state_read().expect("v1 state");
        let mut contract = Self {
            leaders: old.leaders,
            follows: old.follows,
            trades: old.trades,
            next_trade_id: old.next_trade_id,
            policies: old.policies,
            copies: old.copies,
            next_copy_id: old.next_copy_id,
            high_water: old.high_water,
            market_follows: old.market_follows,
            view_prices: old.view_prices,
            viewers: old.viewers,
            journals: old.journals,
            books: old.books,
            swaps: old.swaps,
            next_swap_id: old.next_swap_id,
            swap_ids: old.swap_ids,
            opened_fee_bps: LookupMap::new(b"e"),
            copier_counts: LookupMap::new(b"n"),
            follower_copy_ids: LookupMap::new(b"y"),
            leader_copy_ids: LookupMap::new(b"z"),
        };
        contract.rebuild_indexes();
        contract
    }

    #[payable]
    pub fn register_leader(&mut self, fee_bps: u16, display_name: String) {
        let before = env::storage_usage();
        require!(fee_bps <= 10_000, "fee_bps must be <= 10000");
        require!(
            (1..=48).contains(&display_name.len()),
            "display_name length"
        );
        let id = env::predecessor_account_id();
        let previous = self.leaders.get(&id).cloned();
        let leading_since = previous
            .as_ref()
            .map(|leader| leader.leading_since)
            .unwrap_or_else(env::block_timestamp);
        let trade_ids = previous
            .as_ref()
            .map(|leader| leader.trade_ids.clone())
            .unwrap_or_default();
        let snapshot = previous.and_then(|leader| leader.snapshot);
        self.leaders.insert(
            id,
            Leader {
                fee_bps,
                display_name,
                leading_since,
                snapshot,
                trade_ids,
            },
        );
        self.refund_storage(before, NearToken::from_yoctonear(0));
    }

    #[payable]
    pub fn publish_snapshot(
        &mut self,
        pnl_bps: i32,
        max_dd_bps: u32,
        win_rate_bps: u32,
        trade_count: u32,
        copier_pnl_bps: i32,
        journal_commitment: String,
        curve: Vec<i32>,
    ) {
        let before = env::storage_usage();
        require!(max_dd_bps <= 10_000, "max_dd_bps must be <= 10000");
        require!(win_rate_bps <= 10_000, "win_rate_bps must be <= 10000");
        require!(curve.len() <= MAX_CURVE, "curve too long");
        require!(
            (1..=128).contains(&journal_commitment.len()),
            "journal_commitment length"
        );
        let id = env::predecessor_account_id();
        let leader = self.leaders.get_mut(&id).expect("register_leader first");
        leader.snapshot = Some(Snapshot {
            pnl_bps,
            max_dd_bps,
            win_rate_bps,
            trade_count,
            copier_pnl_bps,
            journal_commitment,
            curve,
            updated_at: env::block_timestamp(),
        });
        self.refund_storage(before, NearToken::from_yoctonear(0));
    }

    /// Legacy single cutoff. Kept so the old state still deserializes. It does not authorize `open_copy`.
    #[payable]
    pub fn follow(&mut self, leader: AccountId) {
        let before = env::storage_usage();
        require!(self.leaders.get(&leader).is_some(), "leader not found");
        let follower = env::predecessor_account_id();
        require!(follower != leader, "leader cannot follow self");
        let key = sub_key(&leader, &follower);
        if self.follows.get(&key).is_none() {
            self.follows.insert(
                key,
                Follow {
                    followed_at: env::block_timestamp(),
                },
            );
        }
        self.refund_storage(before, NearToken::from_yoctonear(0));
    }

    /// Records one cutoff for this market. A later call for the same market keeps the original time.
    #[payable]
    pub fn follow_market(&mut self, leader: AccountId, market: Market) {
        let before = env::storage_usage();
        require!(self.leaders.get(&leader).is_some(), "leader not found");
        let follower = env::predecessor_account_id();
        require!(follower != leader, "leader cannot follow self");
        let key = market_key(&leader, &follower, market);
        if self.market_follows.get(&key).is_none() {
            let first_market = self
                .market_follows
                .get(&market_key(&leader, &follower, Market::Spot))
                .is_none()
                && self
                    .market_follows
                    .get(&market_key(&leader, &follower, Market::Perp))
                    .is_none();
            self.market_follows.insert(
                key,
                Follow {
                    followed_at: env::block_timestamp(),
                },
            );
            if first_market {
                let count = self.copier_counts.get(&leader).copied().unwrap_or(0);
                self.copier_counts.insert(leader, count.saturating_add(1));
            }
        }
        self.refund_storage(before, NearToken::from_yoctonear(0));
    }

    /// Price of one viewing key. The payment goes to the leader. This is not an intents.near key.
    #[payable]
    pub fn set_view_price(&mut self, price: NearToken) {
        let before = env::storage_usage();
        let leader = env::predecessor_account_id();
        require!(self.leaders.get(&leader).is_some(), "register_leader first");
        require!(price.as_yoctonear() > 0, "price must be positive");
        self.view_prices.insert(leader, price);
        self.refund_storage(before, NearToken::from_yoctonear(0));
    }

    /// Records the buyer's X25519 public key once and pays the leader.
    #[payable]
    pub fn buy_view(&mut self, leader: AccountId, public_hex: String) {
        let before = env::storage_usage();
        require!(self.leaders.get(&leader).is_some(), "leader not found");
        let buyer = env::predecessor_account_id();
        require!(buyer != leader, "leader cannot buy own view");
        require!(is_public_hex(&public_hex), "public_hex must be 64 hex chars");
        let key = sub_key(&leader, &buyer);
        if self.viewers.get(&key).is_some() {
            self.refund_storage(before, NearToken::from_yoctonear(0));
            return;
        }
        let price = self.view_prices.get(&leader).copied().expect("set a view price");
        self.viewers.insert(
            key,
            ViewingRight {
                public_hex,
                bought_at: env::block_timestamp(),
            },
        );
        self.refund_storage(before, price);
        if price.as_yoctonear() > 0 {
            let _ = Promise::new(leader).transfer(price);
        }
    }

    /// Replaces the sealed journal. Every wrap must belong to someone who already bought a view.
    #[payable]
    pub fn publish_journal(&mut self, ciphertext: String, wraps: Vec<WrapInput>) {
        let before = env::storage_usage();
        require!((1..=MAX_CIPHERTEXT).contains(&ciphertext.len()), "ciphertext length");
        require!((1..=MAX_WRAPS).contains(&wraps.len()), "wrap count");
        let leader = env::predecessor_account_id();
        require!(self.leaders.get(&leader).is_some(), "register_leader first");
        let mut seen: Vec<AccountId> = Vec::new();
        let mut stored = Vec::with_capacity(wraps.len());
        for wrap in wraps {
            require!(
                (1..=MAX_WRAPPED_KEY).contains(&wrap.wrapped_key.len()),
                "wrapped_key length"
            );
            require!(!seen.contains(&wrap.buyer), "duplicate buyer");
            require!(
                self.viewers.get(&sub_key(&leader, &wrap.buyer)).is_some(),
                "buyer has no viewing key"
            );
            seen.push(wrap.buyer.clone());
            stored.push(KeyWrap {
                buyer: wrap.buyer,
                wrapped_key: wrap.wrapped_key,
            });
        }
        self.journals.insert(
            leader,
            Journal {
                ciphertext,
                wraps: stored,
            },
        );
        self.refund_storage(before, NearToken::from_yoctonear(0));
    }

    #[payable]
    pub fn publish_trade(
        &mut self,
        market: Market,
        side: Side,
        asset: String,
        amount: String,
    ) -> U64 {
        let before = env::storage_usage();
        require!((1..=MAX_ASSET).contains(&asset.len()), "asset length");
        require!((1..=MAX_AMOUNT).contains(&amount.len()), "amount length");
        require!(!amount.chars().any(char::is_whitespace), "amount has space");
        match market {
            Market::Spot => require!(
                side == Side::Buy || side == Side::Sell,
                "spot side must be buy or sell"
            ),
            Market::Perp => require!(
                side == Side::Long || side == Side::Short,
                "perp side must be long or short"
            ),
        }
        let leader_id = env::predecessor_account_id();
        require!(
            self.leaders.get(&leader_id).is_some(),
            "register_leader first"
        );
        let id = self.next_trade_id;
        self.next_trade_id += 1;
        self.trades.insert(
            id,
            Trade {
                id,
                leader: leader_id.clone(),
                market,
                side,
                asset,
                amount,
                created_at: env::block_timestamp(),
            },
        );
        let leader = self.leaders.get_mut(&leader_id).expect("leader missing");
        require!(leader.trade_ids.len() < MAX_TRADES, "too many trades");
        leader.trade_ids.push(id);
        self.refund_storage(before, NearToken::from_yoctonear(0));
        U64(id)
    }

    /// Freezes the leader's balances once. Later calls cannot move this starting book.
    #[payable]
    pub fn publish_book(&mut self, holdings: Vec<BalanceInput>) {
        let before = env::storage_usage();
        let leader = env::predecessor_account_id();
        require!(self.leaders.get(&leader).is_some(), "register_leader first");
        require!(self.books.get(&leader).is_none(), "book already frozen");
        require!(
            (1..=MAX_HOLDINGS).contains(&holdings.len()),
            "holdings count"
        );
        let mut seen: Vec<String> = Vec::new();
        let mut stored = Vec::with_capacity(holdings.len());
        for holding in holdings {
            require!(is_label(&holding.token_id), "token_id");
            require!(is_amount(&holding.available), "available");
            require!(!seen.contains(&holding.token_id), "duplicate token");
            seen.push(holding.token_id.clone());
            stored.push(Balance {
                token_id: holding.token_id,
                available: holding.available,
            });
        }
        self.books.insert(
            leader,
            Book {
                marked_at: env::block_timestamp(),
                holdings: stored,
            },
        );
        self.refund_storage(before, NearToken::from_yoctonear(0));
    }

    /// Records one exchange after the book is frozen. The time is the block time.
    #[payable]
    pub fn publish_swap(
        &mut self,
        asset_out: String,
        amount_out: String,
        asset_in: String,
        amount_in: String,
    ) -> U64 {
        let before = env::storage_usage();
        require!(is_label(&asset_out) && is_label(&asset_in), "asset");
        require!(asset_out != asset_in, "assets must differ");
        require!(is_amount(&amount_out) && is_amount(&amount_in), "amount");
        let leader_id = env::predecessor_account_id();
        require!(self.books.get(&leader_id).is_some(), "freeze a book first");
        let id = self.next_swap_id;
        self.next_swap_id += 1;
        self.swaps.insert(
            id,
            Swap {
                id,
                leader: leader_id.clone(),
                asset_out,
                amount_out,
                asset_in,
                amount_in,
                created_at: env::block_timestamp(),
            },
        );
        let mut ids = self.swap_ids.get(&leader_id).cloned().unwrap_or_default();
        require!(ids.len() < MAX_SWAPS, "too many swaps");
        ids.push(id);
        self.swap_ids.insert(leader_id, ids);
        self.refund_storage(before, NearToken::from_yoctonear(0));
        U64(id)
    }

    #[payable]
    pub fn set_policy(
        &mut self,
        spot_max_equity_bps: u16,
        perp_max_equity_bps: u16,
        max_leverage: u8,
        markets_commitment: String,
    ) {
        let before = env::storage_usage();
        require!(spot_max_equity_bps <= 10_000, "spot equity too high");
        require!(perp_max_equity_bps <= 10_000, "perp equity too high");
        require!((1..=40).contains(&max_leverage), "max_leverage 1..=40");
        require!(markets_commitment.len() <= 128, "markets_commitment length");
        self.policies.insert(
            env::predecessor_account_id(),
            Policy {
                spot_max_equity_bps,
                perp_max_equity_bps,
                max_leverage,
                markets_commitment,
            },
        );
        self.refund_storage(before, NearToken::from_yoctonear(0));
    }

    /// `fee_cap` is the most the leader can later take from this copy.
    #[payable]
    pub fn open_copy(
        &mut self,
        leader: AccountId,
        trade_id: u64,
        notional_commitment: String,
        equity_bps: u16,
        leverage: u8,
        fee_cap: NearToken,
    ) -> U64 {
        let before = env::storage_usage();
        require!(fee_cap.as_yoctonear() > 0, "fee_cap must be positive");
        require!(
            (1..=128).contains(&notional_commitment.len()),
            "notional_commitment length"
        );
        require!(equity_bps <= 10_000, "equity_bps too high");
        let trade = self.trades.get(&trade_id).expect("trade not found").clone();
        require!(trade.leader == leader, "trade leader mismatch");
        let follower = env::predecessor_account_id();
        require!(follower != leader, "leader cannot copy self");
        let follow = self
            .market_follows
            .get(&market_key(&leader, &follower, trade.market))
            .expect("follow this market first");
        require!(
            trade.created_at > follow.followed_at,
            "trade is before follow"
        );
        let policy = self.policies.get(&follower).expect("set a policy first");
        let cap = match trade.market {
            Market::Spot => policy.spot_max_equity_bps,
            Market::Perp => policy.perp_max_equity_bps,
        };
        require!(equity_bps <= cap, "exceeds policy");
        require!(leverage >= 1 && leverage <= policy.max_leverage, "leverage");
        if trade.market == Market::Spot {
            require!(leverage == 1, "spot leverage must be 1");
        }
        let id = self.next_copy_id;
        self.next_copy_id += 1;
        let fee_bps = self.leaders.get(&leader).expect("leader missing").fee_bps;
        self.opened_fee_bps.insert(id, fee_bps);
        self.push_copy_id(&follower, id, true);
        self.push_copy_id(&leader, id, false);
        self.copies.insert(
            id,
            CopyPosition {
                id,
                follower,
                leader,
                trade_id,
                market: trade.market,
                notional_commitment,
                equity_bps,
                leverage,
                escrow: fee_cap,
                fee_paid: NearToken::from_yoctonear(0),
                proposed_profit: None,
                status: CopyStatus::Open,
                opened_at: env::block_timestamp(),
                proposed_at: 0,
            },
        );
        self.refund_storage(before, fee_cap);
        U64(id)
    }

    #[payable]
    pub fn propose_settlement(&mut self, copy_id: u64, profit: String) {
        require!(
            env::attached_deposit() >= NearToken::from_yoctonear(1),
            "requires attached deposit of at least 1 yoctoNEAR"
        );
        let profit_value = parse_profit(&profit);
        let follower = env::predecessor_account_id();
        let copy_snapshot = self.copies.get(&copy_id).expect("copy not found").clone();
        require!(copy_snapshot.follower == follower, "only the follower");
        require!(copy_snapshot.status == CopyStatus::Open, "copy is not open");
        let fee_bps = self.fee_bps_at_open(copy_id);
        let high_water = self.high_water_of(&copy_snapshot.leader, &copy_snapshot.follower);
        let gross = gross_fee(profit_value, high_water, fee_bps);
        require!(
            gross <= copy_snapshot.escrow.as_yoctonear(),
            "profit fee exceeds escrow"
        );
        let before = env::storage_usage();
        if gross == 0 {
            let escrow = {
                let copy = self.copies.get_mut(&copy_id).expect("copy not found");
                copy.proposed_profit = Some(profit);
                copy.fee_paid = NearToken::from_yoctonear(0);
                copy.status = CopyStatus::Settled;
                let escrow = copy.escrow;
                copy.escrow = NearToken::from_yoctonear(0);
                escrow
            };
            self.refund_storage(before, NearToken::from_yoctonear(1));
            if escrow.as_yoctonear() > 0 {
                let _ = Promise::new(follower).transfer(escrow);
            }
            return;
        }
        {
            let copy = self.copies.get_mut(&copy_id).expect("copy not found");
            copy.proposed_profit = Some(profit);
            copy.proposed_at = env::block_timestamp();
            copy.status = CopyStatus::Proposed;
        }
        self.refund_storage(before, NearToken::from_yoctonear(1));
    }

    #[payable]
    pub fn confirm_settlement(&mut self, copy_id: u64, profit: String) {
        require!(
            env::attached_deposit() >= NearToken::from_yoctonear(1),
            "requires attached deposit of at least 1 yoctoNEAR"
        );
        let profit_value = parse_profit(&profit);
        let leader = env::predecessor_account_id();
        let copy = self.copies.get(&copy_id).expect("copy not found").clone();
        require!(copy.leader == leader, "only the leader");
        require!(copy.status == CopyStatus::Proposed, "nothing proposed");
        require!(
            copy.proposed_profit.as_deref() == Some(profit.as_str()),
            "profit mismatch"
        );
        let fee_bps = self.fee_bps_at_open(copy_id);
        let water_key = sub_key(&copy.leader, &copy.follower);
        let high_water = self.high_water.get(&water_key).copied().unwrap_or(0);
        let gross = gross_fee(profit_value, high_water, fee_bps);
        require!(gross > 0, "no fee to confirm");
        require!(
            gross <= copy.escrow.as_yoctonear(),
            "profit fee exceeds escrow"
        );
        let before = env::storage_usage();
        let fee_token = NearToken::from_yoctonear(gross);
        let refund = copy.escrow.saturating_sub(fee_token);
        if profit_value > high_water {
            self.high_water.insert(water_key, profit_value);
        }
        let follower = {
            let stored = self.copies.get_mut(&copy_id).expect("copy missing");
            stored.fee_paid = fee_token;
            stored.escrow = NearToken::from_yoctonear(0);
            stored.status = CopyStatus::Settled;
            stored.follower.clone()
        };
        self.refund_storage(before, NearToken::from_yoctonear(0));
        if fee_token.as_yoctonear() > 0 {
            let _ = Promise::new(leader).transfer(fee_token);
        }
        if refund.as_yoctonear() > 0 {
            let _ = Promise::new(follower).transfer(refund);
        }
    }

    /// Leader silence does not pay the leader. After the timeout the follower
    /// takes the whole escrow back. An open copy can be reclaimed immediately.
    #[payable]
    pub fn reclaim_copy(&mut self, copy_id: u64) {
        require_one_yocto();
        let follower = env::predecessor_account_id();
        let copy = self.copies.get_mut(&copy_id).expect("copy not found");
        require!(copy.follower == follower, "only the follower");
        match copy.status {
            CopyStatus::Open => {}
            CopyStatus::Proposed => {
                require!(
                    env::block_timestamp()
                        >= copy.proposed_at.saturating_add(SETTLEMENT_TIMEOUT_NS),
                    "settlement timeout not reached"
                );
            }
            _ => require!(false, "copy is closed"),
        }
        let escrow = copy.escrow;
        copy.escrow = NearToken::from_yoctonear(0);
        copy.fee_paid = NearToken::from_yoctonear(0);
        copy.status = CopyStatus::Refunded;
        if escrow.as_yoctonear() > 0 {
            let _ = Promise::new(follower).transfer(escrow);
        }
    }

    pub fn quote_performance_fee(
        &self,
        profit: String,
        high_water: String,
        fee_bps: u16,
        escrow: NearToken,
    ) -> NearToken {
        require!(fee_bps <= 10_000, "fee_bps must be <= 10000");
        NearToken::from_yoctonear(performance_fee(
            parse_profit(&profit),
            parse_profit(&high_water),
            fee_bps,
            escrow.as_yoctonear(),
        ))
    }

    pub fn get_leader(&self, account_id: AccountId) -> Option<LeaderView> {
        let leader = self.leaders.get(&account_id)?.clone();
        Some(self.leader_view(account_id, &leader))
    }

    pub fn list_leaders(&self, from_index: u32, limit: u32) -> Vec<LeaderView> {
        let limit = limit.min(50) as usize;
        let page: Vec<(AccountId, Leader)> = self
            .leaders
            .iter()
            .skip(from_index as usize)
            .take(limit)
            .map(|(id, leader)| (id.clone(), leader.clone()))
            .collect();
        page.into_iter()
            .map(|(id, leader)| self.leader_view(id, &leader))
            .collect()
    }

    pub fn get_follow(&self, leader: AccountId, follower: AccountId) -> Option<FollowView> {
        self.follows
            .get(&sub_key(&leader, &follower))
            .map(|follow| FollowView {
                leader,
                follower,
                followed_at: U64(follow.followed_at),
            })
    }

    pub fn get_market_follow(
        &self,
        leader: AccountId,
        follower: AccountId,
        market: Market,
    ) -> Option<MarketFollowView> {
        self.market_follows
            .get(&market_key(&leader, &follower, market))
            .map(|follow| MarketFollowView {
                leader,
                follower,
                market,
                followed_at: U64(follow.followed_at),
            })
    }

    pub fn list_market_followers(
        &self,
        leader: AccountId,
        market: Market,
        from_index: u32,
        limit: u32,
    ) -> Vec<MarketFollowView> {
        let limit = limit.min(50) as usize;
        self.market_follows
            .iter()
            .filter(|(key, _)| key.leader == leader && key.market == market)
            .skip(from_index as usize)
            .take(limit)
            .map(|(key, follow)| MarketFollowView {
                leader: key.leader.clone(),
                follower: key.follower.clone(),
                market: key.market,
                followed_at: U64(follow.followed_at),
            })
            .collect()
    }

    pub fn list_followers(
        &self,
        leader: AccountId,
        from_index: u32,
        limit: u32,
    ) -> Vec<FollowView> {
        let limit = limit.min(50) as usize;
        self.follows
            .iter()
            .filter(|(key, _)| key.leader == leader)
            .skip(from_index as usize)
            .take(limit)
            .map(|(key, follow)| FollowView {
                leader: key.leader.clone(),
                follower: key.follower.clone(),
                followed_at: U64(follow.followed_at),
            })
            .collect()
    }

    pub fn get_view_price(&self, leader: AccountId) -> Option<NearToken> {
        self.view_prices.get(&leader).copied()
    }

    pub fn get_viewer(&self, leader: AccountId, buyer: AccountId) -> Option<ViewerView> {
        self.viewers
            .get(&sub_key(&leader, &buyer))
            .map(|right| ViewerView {
                leader,
                buyer,
                public_hex: right.public_hex.clone(),
                bought_at: U64(right.bought_at),
            })
    }

    pub fn list_viewers(&self, leader: AccountId, from_index: u32, limit: u32) -> Vec<ViewerView> {
        let limit = limit.min(50) as usize;
        self.viewers
            .iter()
            .filter(|(key, _)| key.leader == leader)
            .skip(from_index as usize)
            .take(limit)
            .map(|(key, right)| ViewerView {
                leader: key.leader.clone(),
                buyer: key.follower.clone(),
                public_hex: right.public_hex.clone(),
                bought_at: U64(right.bought_at),
            })
            .collect()
    }

    pub fn get_journal(&self, leader: AccountId) -> Option<JournalView> {
        self.journals.get(&leader).map(|journal| JournalView {
            leader,
            ciphertext: journal.ciphertext.clone(),
            wraps: journal
                .wraps
                .iter()
                .map(|wrap| WrapInput {
                    buyer: wrap.buyer.clone(),
                    wrapped_key: wrap.wrapped_key.clone(),
                })
                .collect(),
        })
    }

    pub fn get_book(&self, account_id: AccountId) -> Option<BookView> {
        self.books.get(&account_id).map(|book| BookView {
            leader: account_id,
            marked_at: U64(book.marked_at),
            holdings: book
                .holdings
                .iter()
                .map(|holding| BalanceInput {
                    token_id: holding.token_id.clone(),
                    available: holding.available.clone(),
                })
                .collect(),
        })
    }

    pub fn list_swaps(&self, leader: AccountId, from_index: u32, limit: u32) -> Vec<SwapView> {
        let Some(ids) = self.swap_ids.get(&leader) else {
            return Vec::new();
        };
        let limit = limit.min(50) as usize;
        ids.iter()
            .skip(from_index as usize)
            .take(limit)
            .filter_map(|id| self.swaps.get(id))
            .map(|swap| SwapView {
                id: U64(swap.id),
                leader: swap.leader.clone(),
                asset_out: swap.asset_out.clone(),
                amount_out: swap.amount_out.clone(),
                asset_in: swap.asset_in.clone(),
                amount_in: swap.amount_in.clone(),
                created_at: U64(swap.created_at),
            })
            .collect()
    }

    pub fn get_trade(&self, trade_id: u64) -> Option<TradeView> {
        self.trades.get(&trade_id).map(trade_view)
    }

    pub fn list_trades(
        &self,
        leader: AccountId,
        market: Option<Market>,
        from_index: u32,
        limit: u32,
    ) -> Vec<TradeView> {
        let Some(leader_state) = self.leaders.get(&leader) else {
            return Vec::new();
        };
        let limit = limit.min(50) as usize;
        leader_state
            .trade_ids
            .iter()
            .filter_map(|id| self.trades.get(id))
            .filter(|trade| market.map(|market| trade.market == market).unwrap_or(true))
            .skip(from_index as usize)
            .take(limit)
            .map(trade_view)
            .collect()
    }

    pub fn get_policy(&self, account_id: AccountId) -> Option<PolicyView> {
        self.policies.get(&account_id).map(|policy| PolicyView {
            spot_max_equity_bps: policy.spot_max_equity_bps,
            perp_max_equity_bps: policy.perp_max_equity_bps,
            max_leverage: policy.max_leverage,
            markets_commitment: policy.markets_commitment.clone(),
        })
    }

    pub fn get_copy(&self, copy_id: u64) -> Option<CopyView> {
        self.copies.get(&copy_id).map(copy_view)
    }

    pub fn list_copies_by_follower(
        &self,
        follower: AccountId,
        from_index: u32,
        limit: u32,
    ) -> Vec<CopyView> {
        self.copies_by_ids(self.follower_copy_ids.get(&follower), from_index, limit)
    }

    pub fn list_copies_by_leader(
        &self,
        leader: AccountId,
        from_index: u32,
        limit: u32,
    ) -> Vec<CopyView> {
        self.copies_by_ids(self.leader_copy_ids.get(&leader), from_index, limit)
    }

    pub fn get_high_water(&self, leader: AccountId, follower: AccountId) -> String {
        self.high_water_of(&leader, &follower).to_string()
    }

    fn copies_by_ids(
        &self,
        ids: Option<&Vec<u64>>,
        from_index: u32,
        limit: u32,
    ) -> Vec<CopyView> {
        let Some(ids) = ids else {
            return Vec::new();
        };
        let limit = limit.min(50) as usize;
        ids.iter()
            .skip(from_index as usize)
            .take(limit)
            .filter_map(|id| self.copies.get(id))
            .map(copy_view)
            .collect()
    }

    fn fee_bps_at_open(&self, copy_id: u64) -> u16 {
        self.opened_fee_bps
            .get(&copy_id)
            .copied()
            .expect("fee locked at open")
    }

    fn push_copy_id(&mut self, account: &AccountId, id: u64, follower_side: bool) {
        if follower_side {
            let mut ids = self
                .follower_copy_ids
                .get(account)
                .cloned()
                .unwrap_or_default();
            ids.push(id);
            self.follower_copy_ids.insert(account.clone(), ids);
        } else {
            let mut ids = self.leader_copy_ids.get(account).cloned().unwrap_or_default();
            ids.push(id);
            self.leader_copy_ids.insert(account.clone(), ids);
        }
    }

    fn rebuild_indexes(&mut self) {
        let follows: Vec<(AccountId, AccountId)> = self
            .market_follows
            .iter()
            .map(|(key, _)| (key.leader.clone(), key.follower.clone()))
            .collect();
        let mut seen: Vec<SubKey> = Vec::new();
        for (leader, follower) in follows {
            let pair = sub_key(&leader, &follower);
            if seen.contains(&pair) {
                continue;
            }
            seen.push(pair);
            let count = self.copier_counts.get(&leader).copied().unwrap_or(0);
            self.copier_counts.insert(leader, count.saturating_add(1));
        }
        let copies: Vec<(u64, AccountId, AccountId)> = self
            .copies
            .iter()
            .map(|(_, copy)| (copy.id, copy.follower.clone(), copy.leader.clone()))
            .collect();
        for (id, follower, leader) in copies {
            let fee_bps = self.leaders.get(&leader).map(|leader| leader.fee_bps).unwrap_or(0);
            self.opened_fee_bps.insert(id, fee_bps);
            self.push_copy_id(&follower, id, true);
            self.push_copy_id(&leader, id, false);
        }
    }

    fn leader_view(&self, account_id: AccountId, leader: &Leader) -> LeaderView {
        let copier_count = self.copier_counts.get(&account_id).copied().unwrap_or(0);
        LeaderView {
            account_id,
            fee_bps: leader.fee_bps,
            display_name: leader.display_name.clone(),
            leading_since: U64(leader.leading_since),
            snapshot: leader.snapshot.as_ref().map(|snapshot| SnapshotView {
                pnl_bps: snapshot.pnl_bps,
                max_dd_bps: snapshot.max_dd_bps,
                win_rate_bps: snapshot.win_rate_bps,
                trade_count: snapshot.trade_count,
                copier_pnl_bps: snapshot.copier_pnl_bps,
                journal_commitment: snapshot.journal_commitment.clone(),
                curve: snapshot.curve.clone(),
                updated_at: U64(snapshot.updated_at),
            }),
            copier_count,
        }
    }

    fn high_water_of(&self, leader: &AccountId, follower: &AccountId) -> i128 {
        self.high_water
            .get(&sub_key(leader, follower))
            .copied()
            .unwrap_or(0)
    }

    fn refund_storage(&self, before: u64, keep: NearToken) {
        let after = env::storage_usage();
        let byte_cost = env::storage_byte_cost();
        let (storage_cost, freed) = if after > before {
            (
                byte_cost.saturating_mul((after - before) as u128),
                NearToken::from_yoctonear(0),
            )
        } else {
            (
                NearToken::from_yoctonear(0),
                byte_cost.saturating_mul(before.saturating_sub(after) as u128),
            )
        };
        let attached = env::attached_deposit();
        let required = keep.saturating_add(storage_cost);
        require!(
            attached >= required,
            format!("attach at least {} yoctoNEAR", required.as_yoctonear())
        );
        let refund = attached.saturating_sub(required).saturating_add(freed);
        if refund.as_yoctonear() > 0 {
            let _ = Promise::new(env::predecessor_account_id()).transfer(refund);
        }
    }
}

fn sub_key(leader: &AccountId, follower: &AccountId) -> SubKey {
    SubKey {
        leader: leader.clone(),
        follower: follower.clone(),
    }
}

fn is_public_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn is_label(value: &str) -> bool {
    (1..=MAX_ASSET).contains(&value.len()) && !value.chars().any(char::is_whitespace)
}

fn is_amount(value: &str) -> bool {
    let bytes = value.as_bytes();
    (1..=MAX_AMOUNT).contains(&bytes.len())
        && bytes.iter().all(|byte| byte.is_ascii_digit())
        && bytes[0] != b'0'
}

fn market_key(leader: &AccountId, follower: &AccountId, market: Market) -> MarketKey {
    MarketKey {
        leader: leader.clone(),
        follower: follower.clone(),
        market,
    }
}

fn require_one_yocto() {
    require!(
        env::attached_deposit() == NearToken::from_yoctonear(1),
        "requires attached deposit of exactly 1 yoctoNEAR"
    );
}

fn parse_profit(value: &str) -> i128 {
    require!(value.len() <= MAX_PROFIT_LEN, "profit length");
    let digits = value.strip_prefix('-').unwrap_or(value);
    require!(
        !digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_digit()),
        "profit must be an integer string"
    );
    require!(
        digits == "0" || !digits.starts_with('0'),
        "profit must be an integer string"
    );
    require!(
        !(value.starts_with('-') && digits == "0"),
        "profit must be an integer string"
    );
    value
        .parse::<i128>()
        .expect("profit must be an integer string")
}

fn gross_fee(profit: i128, high_water: i128, fee_bps: u16) -> u128 {
    let delta = profit.saturating_sub(high_water);
    if delta <= 0 {
        return 0;
    }
    (delta as u128).saturating_mul(fee_bps as u128) / 10_000
}

fn performance_fee(profit: i128, high_water: i128, fee_bps: u16, escrow: u128) -> u128 {
    gross_fee(profit, high_water, fee_bps).min(escrow)
}

fn trade_view(trade: &Trade) -> TradeView {
    TradeView {
        id: U64(trade.id),
        leader: trade.leader.clone(),
        market: trade.market,
        side: trade.side,
        asset: trade.asset.clone(),
        amount: trade.amount.clone(),
        created_at: U64(trade.created_at),
    }
}

fn copy_view(copy: &CopyPosition) -> CopyView {
    CopyView {
        id: U64(copy.id),
        follower: copy.follower.clone(),
        leader: copy.leader.clone(),
        trade_id: U64(copy.trade_id),
        market: copy.market,
        notional_commitment: copy.notional_commitment.clone(),
        equity_bps: copy.equity_bps,
        leverage: copy.leverage,
        escrow: copy.escrow,
        fee_paid: copy.fee_paid,
        proposed_profit: copy.proposed_profit.clone(),
        status: copy.status,
        opened_at: U64(copy.opened_at),
        proposed_at: U64(copy.proposed_at),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::testing_env;

    fn leader() -> AccountId {
        accounts(1)
    }

    fn follower() -> AccountId {
        accounts(2)
    }

    fn set_ctx(predecessor: AccountId, deposit: NearToken, timestamp: u64) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(accounts(0))
            .signer_account_id(predecessor.clone())
            .predecessor_account_id(predecessor)
            .attached_deposit(deposit)
            .block_timestamp(timestamp)
            .account_balance(NearToken::from_near(50));
        testing_env!(builder.build());
    }

    fn init_contract() -> Contract {
        set_ctx(leader(), NearToken::from_yoctonear(0), 1_000);
        Contract::init()
    }

    fn register(contract: &mut Contract, at: u64) {
        set_ctx(leader(), NearToken::from_near(1), at);
        contract.register_leader(1_000, "Ada".to_string());
    }

    fn publish(contract: &mut Contract, market: Market, side: Side, asset: &str, at: u64) -> U64 {
        set_ctx(leader(), NearToken::from_near(1), at);
        contract.publish_trade(market, side, asset.to_string(), "5".to_string())
    }

    fn follow_market_at(contract: &mut Contract, market: Market, at: u64) {
        set_ctx(follower(), NearToken::from_near(1), at);
        contract.follow_market(leader(), market);
    }

    fn policy(contract: &mut Contract, at: u64) {
        set_ctx(follower(), NearToken::from_near(1), at);
        contract.set_policy(5_000, 2_000, 5, "spot,perp".to_string());
    }

    fn open_followed_spot(contract: &mut Contract, fee_cap: NearToken, at: u64) -> u64 {
        let trade = publish(contract, Market::Spot, Side::Buy, "wrap.near", at);
        set_ctx(
            follower(),
            fee_cap.saturating_add(NearToken::from_near(1)),
            at + 50,
        );
        contract
            .open_copy(leader(), trade.0, "notion".to_string(), 100, 1, fee_cap)
            .0
    }

    #[test]
    fn trades_are_public_before_follow() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        publish(&mut contract, Market::Spot, Side::Buy, "wrap.near", 1_500);
        let trades = contract.list_trades(leader(), None, 0, 10);
        assert_eq!(trades.len(), 1);
        assert_eq!(trades[0].asset, "wrap.near");
        assert_eq!(trades[0].side, Side::Buy);
        assert!(contract.get_market_follow(leader(), follower(), Market::Spot).is_none());
        assert_eq!(contract.get_leader(leader()).unwrap().copier_count, 0);
    }

    #[test]
    fn follow_market_timestamp_is_write_once() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 2_000);
        follow_market_at(&mut contract, Market::Spot, 9_000);
        follow_market_at(&mut contract, Market::Perp, 3_000);
        let spot = contract.get_market_follow(leader(), follower(), Market::Spot).unwrap();
        let perp = contract.get_market_follow(leader(), follower(), Market::Perp).unwrap();
        assert_eq!(spot.followed_at, U64(2_000));
        assert_eq!(perp.followed_at, U64(3_000));
        assert_eq!(contract.get_leader(leader()).unwrap().copier_count, 1);
    }

    #[test]
    #[should_panic(expected = "follow this market first")]
    fn legacy_follow_does_not_open_copy() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        set_ctx(follower(), NearToken::from_near(1), 1_200);
        contract.follow(leader());
        publish(&mut contract, Market::Spot, Side::Buy, "wrap.near", 1_500);
        policy(&mut contract, 1_600);
        set_ctx(follower(), NearToken::from_near(1), 1_700);
        contract.open_copy(leader(), 1, "legacy".to_string(), 100, 1, NearToken::from_near(1));
    }

    #[test]
    #[should_panic(expected = "trade is before follow")]
    fn open_copy_rejects_trade_before_follow() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        publish(&mut contract, Market::Spot, Side::Buy, "wrap.near", 1_500);
        follow_market_at(&mut contract, Market::Spot, 2_000);
        policy(&mut contract, 2_100);
        set_ctx(follower(), NearToken::from_near(1), 2_200);
        contract.open_copy(
            leader(),
            1,
            "old".to_string(),
            100,
            1,
            NearToken::from_near(1),
        );
    }

    #[test]
    #[should_panic(expected = "trade is before follow")]
    fn open_copy_rejects_trade_at_follow_timestamp() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        publish(&mut contract, Market::Spot, Side::Buy, "wrap.near", 2_000);
        follow_market_at(&mut contract, Market::Spot, 2_000);
        policy(&mut contract, 2_100);
        set_ctx(follower(), NearToken::from_near(1), 2_200);
        contract.open_copy(
            leader(),
            1,
            "same-time".to_string(),
            100,
            1,
            NearToken::from_near(1),
        );
    }

    #[test]
    fn open_copy_after_follow_settles_profit_and_loss() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        publish(&mut contract, Market::Spot, Side::Buy, "wrap.near", 1_200);
        follow_market_at(&mut contract, Market::Spot, 1_500);
        follow_market_at(&mut contract, Market::Perp, 1_500);
        let spot = publish(&mut contract, Market::Spot, Side::Buy, "wrap.near", 1_800);
        let perp = publish(&mut contract, Market::Perp, Side::Long, "BTC", 1_900);
        assert_eq!(spot, U64(2));
        assert_eq!(perp, U64(3));
        policy(&mut contract, 2_000);

        set_ctx(follower(), NearToken::from_near(2), 2_100);
        let spot_copy = contract.open_copy(
            leader(),
            2,
            "spot-notional".to_string(),
            1_000,
            1,
            NearToken::from_near(2),
        );
        set_ctx(follower(), NearToken::from_near(1), 2_200);
        let perp_copy = contract.open_copy(
            leader(),
            3,
            "perp-notional".to_string(),
            500,
            2,
            NearToken::from_near(1),
        );
        assert_eq!(spot_copy, U64(1));
        assert_eq!(perp_copy, U64(2));

        let profit = NearToken::from_near(10).as_yoctonear().to_string();
        set_ctx(follower(), NearToken::from_near(1), 2_300);
        contract.propose_settlement(1, profit.clone());
        set_ctx(leader(), NearToken::from_near(1), 2_400);
        contract.confirm_settlement(1, profit);
        let settled = contract.get_copy(1).unwrap();
        assert_eq!(settled.status, CopyStatus::Settled);
        assert_eq!(settled.fee_paid, NearToken::from_near(1));
        assert_eq!(
            contract.get_high_water(leader(), follower()),
            NearToken::from_near(10).as_yoctonear().to_string()
        );

        set_ctx(follower(), NearToken::from_near(1), 2_500);
        contract.propose_settlement(2, "-5".to_string());
        let loss = contract.get_copy(2).unwrap();
        assert_eq!(loss.status, CopyStatus::Settled);
        assert_eq!(loss.fee_paid, NearToken::from_yoctonear(0));
        assert_eq!(loss.escrow, NearToken::from_yoctonear(0));
        assert_eq!(
            contract.get_high_water(leader(), follower()),
            NearToken::from_near(10).as_yoctonear().to_string()
        );
    }

    #[test]
    #[should_panic(expected = "exceeds policy")]
    fn perp_equity_does_not_use_spot_cap() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Perp, 1_200);
        publish(&mut contract, Market::Perp, Side::Long, "BTC", 1_500);
        set_ctx(follower(), NearToken::from_near(1), 1_600);
        contract.set_policy(5_000, 100, 5, "perp".to_string());
        set_ctx(follower(), NearToken::from_near(1), 1_700);
        contract.open_copy(
            leader(),
            1,
            "too-big".to_string(),
            500,
            2,
            NearToken::from_near(1),
        );
    }

    #[test]
    #[should_panic(expected = "settlement timeout not reached")]
    fn reclaim_before_timeout_fails() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 1_200);
        publish(&mut contract, Market::Spot, Side::Sell, "wrap.near", 1_500);
        policy(&mut contract, 1_600);
        set_ctx(follower(), NearToken::from_near(1), 1_700);
        contract.open_copy(
            leader(),
            1,
            "notion".to_string(),
            100,
            1,
            NearToken::from_near(1),
        );
        set_ctx(follower(), NearToken::from_near(1), 1_800);
        contract.propose_settlement(1, NearToken::from_near(4).as_yoctonear().to_string());
        set_ctx(follower(), NearToken::from_yoctonear(1), 1_900);
        contract.reclaim_copy(1);
    }

    #[test]
    fn reclaim_after_timeout_returns_escrow_without_paying_leader() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 1_200);
        publish(&mut contract, Market::Spot, Side::Buy, "wrap.near", 1_500);
        policy(&mut contract, 1_600);
        set_ctx(follower(), NearToken::from_near(1), 1_700);
        contract.open_copy(
            leader(),
            1,
            "notion".to_string(),
            100,
            1,
            NearToken::from_near(1),
        );
        set_ctx(follower(), NearToken::from_near(1), 2_000);
        contract.propose_settlement(1, NearToken::from_near(4).as_yoctonear().to_string());
        set_ctx(
            follower(),
            NearToken::from_yoctonear(1),
            2_000 + SETTLEMENT_TIMEOUT_NS,
        );
        contract.reclaim_copy(1);
        let copy = contract.get_copy(1).unwrap();
        assert_eq!(copy.status, CopyStatus::Refunded);
        assert_eq!(copy.fee_paid, NearToken::from_yoctonear(0));
        assert_eq!(contract.get_high_water(leader(), follower()), "0");
    }

    #[test]
    #[should_panic(expected = "profit fee exceeds escrow")]
    fn tiny_escrow_cannot_write_high_water() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 1_200);
        policy(&mut contract, 1_300);
        let copy_id = open_followed_spot(&mut contract, NearToken::from_yoctonear(1), 1_400);
        set_ctx(follower(), NearToken::from_near(1), 1_600);
        contract.propose_settlement(
            copy_id,
            NearToken::from_near(10).as_yoctonear().to_string(),
        );
    }

    #[test]
    #[should_panic(expected = "profit length")]
    fn long_profit_string_is_rejected() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 1_200);
        policy(&mut contract, 1_300);
        let copy_id = open_followed_spot(&mut contract, NearToken::from_near(1), 1_400);
        set_ctx(follower(), NearToken::from_near(1), 1_600);
        contract.propose_settlement(copy_id, "0".repeat(80));
    }

    #[test]
    #[should_panic(expected = "requires attached deposit of at least 1 yoctoNEAR")]
    fn propose_without_deposit_is_rejected() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 1_200);
        policy(&mut contract, 1_300);
        let copy_id = open_followed_spot(&mut contract, NearToken::from_near(1), 1_400);
        set_ctx(follower(), NearToken::from_yoctonear(0), 1_600);
        contract.propose_settlement(copy_id, "1".to_string());
    }

    #[test]
    #[should_panic(expected = "profit mismatch")]
    fn leader_must_submit_the_same_profit() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 1_200);
        policy(&mut contract, 1_300);
        let copy_id = open_followed_spot(&mut contract, NearToken::from_near(2), 1_400);
        let profit = NearToken::from_near(10).as_yoctonear().to_string();
        set_ctx(follower(), NearToken::from_near(1), 1_600);
        contract.propose_settlement(copy_id, profit);
        set_ctx(leader(), NearToken::from_yoctonear(1), 1_700);
        contract.confirm_settlement(copy_id, NearToken::from_near(11).as_yoctonear().to_string());
    }

    #[test]
    #[should_panic(expected = "requires attached deposit of at least 1 yoctoNEAR")]
    fn confirm_requires_one_yocto() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 1_200);
        policy(&mut contract, 1_300);
        let copy_id = open_followed_spot(&mut contract, NearToken::from_near(2), 1_400);
        let profit = NearToken::from_near(10).as_yoctonear().to_string();
        set_ctx(follower(), NearToken::from_near(1), 1_600);
        contract.propose_settlement(copy_id, profit.clone());
        set_ctx(leader(), NearToken::from_yoctonear(0), 1_700);
        contract.confirm_settlement(copy_id, profit);
    }

    #[test]
    #[should_panic(expected = "copy is not open")]
    fn second_proposal_is_rejected() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 1_200);
        policy(&mut contract, 1_300);
        let copy_id = open_followed_spot(&mut contract, NearToken::from_near(2), 1_400);
        let profit = NearToken::from_near(10).as_yoctonear().to_string();
        set_ctx(follower(), NearToken::from_near(1), 1_600);
        contract.propose_settlement(copy_id, profit.clone());
        set_ctx(follower(), NearToken::from_near(1), 1_650);
        contract.propose_settlement(copy_id, profit);
    }

    #[test]
    fn fee_rate_stays_at_open() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 1_200);
        policy(&mut contract, 1_300);
        let copy_id = open_followed_spot(&mut contract, NearToken::from_near(2), 1_400);
        set_ctx(leader(), NearToken::from_near(1), 1_500);
        contract.register_leader(10_000, "Ada".to_string());
        let profit = NearToken::from_near(10).as_yoctonear().to_string();
        set_ctx(follower(), NearToken::from_near(1), 1_600);
        contract.propose_settlement(copy_id, profit.clone());
        set_ctx(leader(), NearToken::from_near(1), 1_700);
        contract.confirm_settlement(copy_id, profit);
        assert_eq!(
            contract.get_copy(copy_id).unwrap().fee_paid,
            NearToken::from_near(1)
        );
        assert_eq!(contract.list_copies_by_follower(follower(), 0, 10).len(), 1);
        assert_eq!(contract.list_copies_by_leader(leader(), 0, 10).len(), 1);
    }

    #[test]
    fn later_paid_profit_still_charges_above_high_water() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 1_200);
        policy(&mut contract, 1_300);
        let first = open_followed_spot(&mut contract, NearToken::from_near(2), 1_400);
        let first_profit = NearToken::from_near(10).as_yoctonear().to_string();
        set_ctx(follower(), NearToken::from_near(1), 1_600);
        contract.propose_settlement(first, first_profit.clone());
        set_ctx(leader(), NearToken::from_near(1), 1_700);
        contract.confirm_settlement(first, first_profit);
        assert_eq!(
            contract.get_high_water(leader(), follower()),
            NearToken::from_near(10).as_yoctonear().to_string()
        );

        let second = open_followed_spot(&mut contract, NearToken::from_near(1), 1_800);
        let second_profit = NearToken::from_near(14).as_yoctonear().to_string();
        set_ctx(follower(), NearToken::from_near(1), 2_000);
        contract.propose_settlement(second, second_profit.clone());
        set_ctx(leader(), NearToken::from_near(1), 2_100);
        contract.confirm_settlement(second, second_profit);
        let settled = contract.get_copy(second).unwrap();
        assert_eq!(settled.fee_paid, NearToken::from_millinear(400));
        assert_eq!(
            contract.get_high_water(leader(), follower()),
            NearToken::from_near(14).as_yoctonear().to_string()
        );
    }

    #[test]
    #[should_panic(expected = "follow this market first")]
    fn spot_follow_does_not_open_later_perp() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Spot, 1_200);
        publish(&mut contract, Market::Perp, Side::Long, "BTC", 1_500);
        policy(&mut contract, 1_600);
        set_ctx(follower(), NearToken::from_near(1), 1_700);
        contract.open_copy(leader(), 1, "perp".to_string(), 100, 1, NearToken::from_near(1));
    }

    #[test]
    #[should_panic(expected = "follow this market first")]
    fn perp_follow_does_not_open_later_spot() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        follow_market_at(&mut contract, Market::Perp, 1_200);
        publish(&mut contract, Market::Spot, Side::Buy, "wrap.near", 1_500);
        policy(&mut contract, 1_600);
        set_ctx(follower(), NearToken::from_near(1), 1_700);
        contract.open_copy(leader(), 1, "spot".to_string(), 100, 1, NearToken::from_near(1));
    }

    #[test]
    fn viewing_key_is_write_once_and_journal_requires_a_buyer() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        set_ctx(leader(), NearToken::from_near(1), 1_100);
        contract.set_view_price(NearToken::from_near(1));
        set_ctx(follower(), NearToken::from_near(2), 1_200);
        let public_hex = "ab".repeat(32);
        contract.buy_view(leader(), public_hex.clone());
        set_ctx(follower(), NearToken::from_near(2), 1_300);
        contract.buy_view(leader(), "cd".repeat(32));
        let viewer = contract.get_viewer(leader(), follower()).unwrap();
        assert_eq!(viewer.public_hex, public_hex);
        assert_eq!(viewer.bought_at, U64(1_200));
        set_ctx(leader(), NearToken::from_near(1), 1_400);
        contract.publish_journal(
            "cipher".to_string(),
            vec![WrapInput {
                buyer: follower(),
                wrapped_key: "wrap".to_string(),
            }],
        );
        let journal = contract.get_journal(leader()).unwrap();
        assert_eq!(journal.ciphertext, "cipher");
        assert_eq!(journal.wraps.len(), 1);
        let snapshot = contract.get_leader(leader()).unwrap().snapshot;
        assert!(snapshot.is_none());
    }

    #[test]
    #[should_panic(expected = "buyer has no viewing key")]
    fn journal_rejects_unpaid_buyer() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        set_ctx(leader(), NearToken::from_near(1), 1_100);
        contract.publish_journal(
            "cipher".to_string(),
            vec![WrapInput {
                buyer: follower(),
                wrapped_key: "wrap".to_string(),
            }],
        );
    }

    #[test]
    fn quote_fee_matches_high_water() {
        let contract = init_contract();
        let fee = contract.quote_performance_fee(
            "10000".to_string(),
            "4000".to_string(),
            1_000,
            NearToken::from_yoctonear(500),
        );
        assert_eq!(fee, NearToken::from_yoctonear(500));
        let zero = contract.quote_performance_fee(
            "1000".to_string(),
            "4000".to_string(),
            1_000,
            NearToken::from_yoctonear(500),
        );
        assert_eq!(zero, NearToken::from_yoctonear(0));
    }

    fn sample_book() -> Vec<BalanceInput> {
        vec![BalanceInput {
            token_id: "nep141:wrap.near".to_string(),
            available: "1000000".to_string(),
        }]
    }

    #[test]
    fn book_is_write_once_and_swap_keeps_both_sides() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        set_ctx(leader(), NearToken::from_near(1), 2_000);
        contract.publish_book(sample_book());
        let book = contract.get_book(leader()).unwrap();
        assert_eq!(book.marked_at, U64(2_000));
        assert_eq!(book.holdings[0].available, "1000000");
        set_ctx(leader(), NearToken::from_near(1), 3_000);
        let id = contract.publish_swap(
            "nep141:wrap.near".to_string(),
            "400000".to_string(),
            "nep141:usdc.near".to_string(),
            "900000".to_string(),
        );
        let swaps = contract.list_swaps(leader(), 0, 10);
        assert_eq!(id, U64(1));
        assert_eq!(swaps.len(), 1);
        assert_eq!(swaps[0].amount_out, "400000");
        assert_eq!(swaps[0].amount_in, "900000");
        assert_eq!(swaps[0].created_at, U64(3_000));
        assert!(swaps[0].created_at.0 > book.marked_at.0);
    }

    #[test]
    #[should_panic(expected = "book already frozen")]
    fn second_book_is_rejected() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        set_ctx(leader(), NearToken::from_near(1), 2_000);
        contract.publish_book(sample_book());
        set_ctx(leader(), NearToken::from_near(1), 2_500);
        contract.publish_book(sample_book());
    }

    #[test]
    #[should_panic(expected = "freeze a book first")]
    fn swap_requires_a_book() {
        let mut contract = init_contract();
        register(&mut contract, 1_000);
        set_ctx(leader(), NearToken::from_near(1), 2_000);
        contract.publish_swap(
            "nep141:wrap.near".to_string(),
            "1".to_string(),
            "nep141:usdc.near".to_string(),
            "1".to_string(),
        );
    }
}
