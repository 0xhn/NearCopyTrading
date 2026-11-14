# NearCopyTrading

A NEAR testnet ledger of public leader trades. Spot and perp are separate follows. A follower can copy a trade only when that trade's market has its own `followed_at`, and `created_at` is later than that time.

## What the contract does

The contract enforces who may copy which trade, and it escrows the profit share. `follow_market(leader, market)` writes one cutoff. Calling it again for the same market keeps the first time. `open_copy` reads the cutoff for the trade's market. A spot follow does not open a later perp, and a perp follow does not open a later spot. The older `follow(leader)` record is still stored. It does not authorize `open_copy`.

A viewing key is an X25519 key kept in the buyer's browser. `buy_view` records the public key and pays the leader. `publish_journal` stores ciphertext that only those buyers can open locally. The key is not registered on `intents.near`, and the app does not keep a 1Click `refreshToken`. Public PnL stays the leader's `publish_snapshot`.

The contract does not see a 1Click fill or a Hyperliquid fill, and it does not place those orders. Spot activity that this app can observe is a 1Click quote it created, polled with `GET /v0/status` until `SUCCESS`. That writer is not in this build. Perp activity is read from a public Hyperliquid address with `userFills` and `clearinghouseState`. Sending USDC through 1Click only funds margin. It is not an order. A function-call key's NEAR allowance does not cap token transfers, and that key can also sign an arbitrary NEP-413 intent. A NEP-366 meta-transaction signs one already-written action. It cannot sign a trade that does not exist yet. Automatic spot copy would be a capped vault. Automatic perp copy would be a revocable Hyperliquid agent, valid at most 180 days, with no per-order cap. Neither is implemented. Quotes stay `dry: true`.

`publish_trade` is a record the leader writes. `open_copy` stores a copy and an escrow. Card ROI, drawdown, and win rate come from `publish_snapshot`, not from executed trades. There is no on-chain AUM or Sharpe ratio, so the hall does not invent those numbers.

## What you can try

Do this, then see that:

1. `cd apps/web && npm install && npm run dev`, then open the printed local URL.
2. On 现货, Ada shows `+12.40%` and a `wrap.near` mark. The card does not show BTC.
3. Switch to 合约. The same card shows a BTC mark and does not show `wrap.near`.
4. Open the spot ledger. The `wrap.near` buy is 开跟前. The line names the spot follow.
5. Open the perp ledger. The BTC long is 开跟前. The line names the perp follow. The two times differ.
6. Copy `#1` is `Settled`. It was opened before this upgrade, under the old single follow. That old follow no longer lets `open_copy` succeed.

## Accounts

| Role | Account |
| --- | --- |
| Contract | `keycopy-ledger.testnet` |
| Leader | `leader.keycopy-k7m2.testnet` |
| Follower | `follower.keycopy-k7m2.testnet` |

`scripts/seed-testnet.sh` already ran once. Running it again is not safe.

These views show the two cutoffs. Both trades are earlier than both market follows.

```sh
near contract call-function as-read-only keycopy-ledger.testnet get_market_follow json-args '{"leader":"leader.keycopy-k7m2.testnet","follower":"follower.keycopy-k7m2.testnet","market":"Spot"}' network-config testnet now
near contract call-function as-read-only keycopy-ledger.testnet get_market_follow json-args '{"leader":"leader.keycopy-k7m2.testnet","follower":"follower.keycopy-k7m2.testnet","market":"Perp"}' network-config testnet now
```

Recorded values:

| Record | Time |
| --- | --- |
| Trade 1 `created_at` | `1793976812137206840` |
| Old `follow` | `1793976819997823935` |
| Trade 2 `created_at` | `1793976827751141059` |
| Spot `follow_market` | `1793983656383487896` |
| Perp `follow_market` | `1793983663664849866` |

The upgrade transaction is `31HXgV9RcrrD5QKvQbccQ26bicsyrEy7vbeEfkfQgAdz`.

## Cutoff

`open_copy` requires `follow_market` for the trade's market and `trade.created_at > followed_at`. An equal timestamp is rejected. Calling `follow_market` again for that market does not move the timestamp. The old `follow` does not count.

The contract cannot see Hyperliquid or Intents fills. The follower proposes a canonical profit integer of at most 40 characters and pays the storage that string adds. `propose_settlement` and `confirm_settlement` attach at least 1 yoctoNEAR. Confirmation refunds the unused deposit after charging storage for a new high-water record. `reclaim_copy` attaches exactly 1 yoctoNEAR. A zero fee returns the escrow and does not move the high water. A positive fee is `max(0, profit - high_water) * fee_bps / 10_000`. If that fee is larger than this copy's escrow, the call is rejected and the high water stays where it is. The leader must confirm the same profit string. Only that confirmation writes the high water. After 24 hours of silence the follower can `reclaim_copy`.

## Measurement

Read from `https://near.com` on 2026-11-06.

- Stylesheet sets `--font-sans` from `--font-figtree` and `--color-green-500: #00ec97`.
- The Create account control includes `bg-gray-900 text-white` and `hover:not-disabled:bg-gray-700`. `data-testid` is `landing-hero-cta`.
- The balance `$150,216.15` is in `-tracking-[0.04em] mt-1 font-medium text-4xl text-gray-900`.
- `#00ec97` is used for selection and the live status wash. Positive and negative ledger numbers use `#009660` and `#9b3a3a` because the homepage leaves dollar amounts in `#171717`.

Re-open the site and compare those class strings if the page has changed.

## What stays off the contract

- Quote previews are requested by the browser from `https://1click.chaindefuser.com/v0/quote` with `dry: true`. There is no Intents testnet. A quote does not move funds and is not a fill.
- The leader sheet does not ask for an API key. NEAR AI attestation is not part of registering a leader. The site and docs are routes on the same app: `/#/home` and `/#/docs/overview`.

## Tests

```sh
cd contracts/keycopy
cargo test --lib
```

`open_copy_rejects_trade_before_follow` panics with `trade is before follow`. `spot_follow_does_not_open_later_perp` and `perp_follow_does_not_open_later_spot` panic with `follow this market first`. `legacy_follow_does_not_open_copy` does the same. `open_copy_after_follow_settles_profit_and_loss` follows both markets, then opens a later trade in each, confirms a fee, and settles a loss at zero fee.

`contracts/keycopy/.github/workflows/deploy-production.yml` comes from the contract template. Do not add production secrets. This project is testnet only.
