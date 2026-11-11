#!/bin/sh
# Seeds keycopy-ledger.testnet once. Not idempotent. Already ran.
# The `follow` call below is the legacy record. It no longer authorizes open_copy.
# Spot and perp cutoffs are follow_market, recorded after the migrate.
set -eu
C=keycopy-ledger.testnet
L=leader.keycopy-k7m2.testnet
F=follower.keycopy-k7m2.testnet

call() {
  signer=$1
  method=$2
  args=$3
  deposit=$4
  near contract call-function as-transaction "$C" "$method" json-args "$args" \
    prepaid-gas '100 Tgas' attached-deposit "$deposit" \
    sign-as "$signer" network-config testnet sign-with-keychain send
}

call "$L" register_leader '{"fee_bps":1000,"display_name":"Ada"}' '0.2 NEAR'

call "$L" publish_snapshot '{"pnl_bps":1240,"max_dd_bps":430,"win_rate_bps":6100,"trade_count":2,"copier_pnl_bps":320,"journal_commitment":"demo-journal","curve":[0,40,20,80,60,124]}' '0.2 NEAR'

call "$L" publish_trade '{"market":"Spot","side":"Buy","asset":"wrap.near","amount":"1000000000000000000000000"}' '0.2 NEAR'

call "$F" follow "{\"leader\":\"$L\"}" '0.2 NEAR'

call "$L" publish_trade '{"market":"Perp","side":"Long","asset":"BTC","amount":"5"}' '0.2 NEAR'

call "$F" set_policy '{"spot_max_equity_bps":5000,"perp_max_equity_bps":2000,"max_leverage":5,"markets_commitment":"spot,perp"}' '0.2 NEAR'

call "$F" open_copy "{\"leader\":\"$L\",\"trade_id\":2,\"notional_commitment\":\"perp-copy\",\"equity_bps\":500,\"leverage\":2,\"fee_cap\":\"200000000000000000000000\"}" '0.5 NEAR'

call "$F" propose_settlement '{"copy_id":1,"profit":"1000000000000000000000000"}' '0 NEAR'

call "$L" confirm_settlement '{"copy_id":1}' '0 NEAR'

near contract call-function as-read-only "$C" get_trade json-args '{"trade_id":1}' network-config testnet now
near contract call-function as-read-only "$C" get_follow json-args "{\"leader\":\"$L\",\"follower\":\"$F\"}" network-config testnet now
near contract call-function as-read-only "$C" get_trade json-args '{"trade_id":2}' network-config testnet now
