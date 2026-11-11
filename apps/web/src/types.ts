export type Market = "Spot" | "Perp";

export type Side = "Buy" | "Sell" | "Long" | "Short";

export type CopyStatus = "Open" | "Proposed" | "Settled" | "Refunded";

export interface Snapshot {
  pnl_bps: number;
  max_dd_bps: number;
  win_rate_bps: number;
  trade_count: number;
  copier_pnl_bps: number;
  journal_commitment: string;
  curve: number[];
  updated_at: string;
}

export interface Leader {
  account_id: string;
  fee_bps: number;
  display_name: string;
  leading_since: string;
  snapshot: Snapshot | null;
  copier_count: number;
}

export interface Balance {
  token_id: string;
  available: string;
}

export interface Book {
  leader: string;
  marked_at: string;
  holdings: Balance[];
}

export interface Swap {
  id: string;
  leader: string;
  asset_out: string;
  amount_out: string;
  asset_in: string;
  amount_in: string;
  created_at: string;
}

export interface Trade {
  id: string;
  leader: string;
  market: Market;
  side: Side;
  asset: string;
  amount: string;
  created_at: string;
}

export interface Follow {
  leader: string;
  follower: string;
  market?: Market;
  followed_at: string;
}

export interface Viewer {
  leader: string;
  buyer: string;
  public_hex: string;
  bought_at: string;
}

export interface JournalWrap {
  buyer: string;
  wrapped_key: string;
}

export interface Journal {
  leader: string;
  ciphertext: string;
  wraps: JournalWrap[];
}

export interface Policy {
  spot_max_equity_bps: number;
  perp_max_equity_bps: number;
  max_leverage: number;
  markets_commitment: string;
}

export interface CopyPosition {
  id: string;
  follower: string;
  leader: string;
  trade_id: string;
  market: Market;
  notional_commitment: string;
  equity_bps: number;
  leverage: number;
  escrow: string;
  fee_paid: string;
  proposed_profit: string | null;
  status: CopyStatus;
  opened_at: string;
  proposed_at: string;
}
